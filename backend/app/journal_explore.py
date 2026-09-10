"""Facet, histogram and paging index over the read-only journal snapshot.

Builds a cached inverted index per message type so the explorer can compute
facet counts and filtered pages without rescanning every record per request.
Nothing here reads the source file directly: it consumes the already-masked
projections from `journal_evidence.snapshot`, so the masking and withholding
rules applied there cover this surface too.
"""
from collections import defaultdict
from datetime import datetime, timezone
from functools import lru_cache

from app.journal_evidence import SCHEMAS, snapshot

# Low-cardinality dimensions worth faceting, per message type. Every entry must
# exist in SCHEMAS for that kind, and must never be a masked or withheld field.
FACET_FIELDS = {
    'ordupd': ('ExchSeg', 'TransType', 'PriceType', 'Product', 'OrdStatus',
               'ReportType', 'RejBy', 'OrdSrc', 'OrdDuration'),
    'login': ('AccessType', 'ReqStatus', 'UserPrivilege', 'Userdetails.BrokerId'),
    'logout': ('AccessType', 'ReqStatus', 'UserPrivilege', 'Userdetails.BrokerId'),
    'yel_connected': (),
}

# Free-text search scope. Deliberately narrower than /records (which serialises
# the whole row): a bounded scope keeps the per-request scan cheap and keeps
# withheld free text out of the searchable surface.
SEARCH_FIELDS = {
    'ordupd': ('NorenOrdNum', 'ExchOrdNum', 'TradingSymbol', 'AcctId', 'UserId',
               'ExchSeg', 'Product', 'PriceType', 'TransType', 'RejBy', 'Token'),
    'login': ('UserId', 'AccessType', 'ReqStatus', 'Userdetails.BrokerId'),
    'logout': ('UserId', 'AccessType', 'ReqStatus', 'Userdetails.BrokerId'),
    'yel_connected': ('Seqno', 'msg_seq'),
}

# Order status codes with an established meaning. Codes outside this map are
# reported as undocumented rather than given an invented label.
STATUS_LABELS = {
    '48': 'Open', '50': 'Complete', '52': 'Cancelled', '54': 'Trigger pending',
    '56': 'Rejected', '65': 'Rejected', '109': 'Pending', '110': 'Pending',
    '115': 'Pending',
}

MAX_FACET_VALUES = 25
HISTOGRAM_BUCKETS = 48


def _epoch(value):
    """Seconds since epoch for an ISO `Event Time (UTC)` string, else None."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def _haystack(fields, kind):
    parts = []
    for field in SEARCH_FIELDS.get(kind, ()):
        value = fields.get(field)
        if value not in (None, ''):
            parts.append(str(value))
    return ' '.join(parts).casefold()


@lru_cache(maxsize=8)
def build_index(path, kind):
    """Inverted index for one message type. Cached alongside the snapshot."""
    rows = snapshot(path)['items'][kind]
    postings = {field: defaultdict(list) for field in FACET_FIELDS.get(kind, ())}
    times, haystacks = [], []
    for position, row in enumerate(rows):
        fields = row['fields']
        for field, values in postings.items():
            value = fields.get(field)
            if value not in (None, ''):
                values[str(value)].append(position)
        times.append(_epoch(fields.get('Event Time (UTC)')))
        haystacks.append(_haystack(fields, kind))
    return {
        'total': len(rows),
        'postings': {field: {value: frozenset(positions) for value, positions in values.items()}
                     for field, values in postings.items()},
        'times': times,
        'haystacks': haystacks,
    }


def _matching(index, kind, selected, q, skip=None):
    """Row positions matching every facet group except `skip`, plus the query."""
    matched = None
    for field, values in selected.items():
        if field == skip or not values:
            continue
        postings = index['postings'].get(field, {})
        union = frozenset().union(*(postings.get(value, frozenset()) for value in values))
        matched = union if matched is None else (matched & union)
        if not matched:
            return frozenset()
    if q:
        needle = q.casefold()
        scanned = {position for position, text in enumerate(index['haystacks']) if needle in text}
        matched = scanned if matched is None else (matched & scanned)
    if matched is None:
        return frozenset(range(index['total']))
    return matched


def _facet_counts(index, kind, selected, q):
    """Counts per facet value, each computed with its own group's filter lifted.

    Lifting the group's own filter is what lets an operator see the other values
    they could switch to, rather than zeroes for everything they did not pick.
    """
    facets = []
    for field in FACET_FIELDS.get(kind, ()):
        scope = _matching(index, kind, selected, q, skip=field)
        chosen = selected.get(field, ())
        values = []
        for value, positions in index['postings'].get(field, {}).items():
            count = len(positions & scope)
            if count or value in chosen:
                values.append({'value': value, 'count': count, 'selected': value in chosen,
                               'label': _label(field, value)})
        values.sort(key=lambda item: (-item['count'], item['value']))
        facets.append({'field': field, 'values': values[:MAX_FACET_VALUES],
                       'truncated': len(values) > MAX_FACET_VALUES})
    return facets


def _label(field, value):
    """Human label for a coded value, or None when the code is undocumented."""
    if field == 'OrdStatus':
        return STATUS_LABELS.get(value)
    return None


def _histogram(index, positions):
    times = sorted(t for t in (index['times'][p] for p in positions) if t is not None)
    if not times:
        return {'buckets': [], 'start': None, 'end': None, 'undated': len(positions)}
    start, end = times[0], times[-1]
    span = end - start
    width = (span / HISTOGRAM_BUCKETS) if span > 0 else 1.0
    counts = [0] * HISTOGRAM_BUCKETS
    for value in times:
        slot = int((value - start) / width) if span > 0 else 0
        counts[min(slot, HISTOGRAM_BUCKETS - 1)] += 1
    buckets = [{'start': datetime.fromtimestamp(start + i * width, timezone.utc).isoformat(),
                'count': count} for i, count in enumerate(counts)]
    return {
        'buckets': buckets,
        'start': datetime.fromtimestamp(start, timezone.utc).isoformat(),
        'end': datetime.fromtimestamp(end, timezone.utc).isoformat(),
        'bucket_seconds': width,
        'undated': len(positions) - len(times),
    }


def explore(path, kind, selected, q='', limit=50, offset=0):
    """Paged rows, facet counts and a time histogram for one message type."""
    index = build_index(path, kind)
    matched = _matching(index, kind, selected, q)
    ordered = sorted(matched)
    rows = snapshot(path)['items'][kind]
    page = [rows[position] for position in ordered[offset:offset + limit]]
    return {
        'source': 'journal snapshot',
        'msg_type': kind,
        'columns': SCHEMAS[kind],
        'facet_fields': list(FACET_FIELDS.get(kind, ())),
        'facets': _facet_counts(index, kind, selected, q),
        'histogram': _histogram(index, matched),
        'total': index['total'],
        'count': len(matched),
        'limit': limit,
        'offset': offset,
        'items': page,
        'search_fields': list(SEARCH_FIELDS.get(kind, ())),
    }
