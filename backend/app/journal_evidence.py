"""Read-only message-type evidence with workbook column order and safe projection."""
import csv
import io
import json
from collections import Counter
from functools import lru_cache
from pathlib import Path
from datetime import datetime, timezone
from app.csv_store import safe_csv_cell
from app.elastic.normalizer import mask_account, mask_id, mask_ip, mask_reason, normalize_session_event

SCHEMAS = json.loads(Path(__file__).with_name('journal_schema.json').read_text())
PERMISSIONS = {'ordupd': 'orders:read', 'login': 'sessions:read', 'logout': 'sessions:read', 'yel_connected': 'exchange:read'}
IDENTIFIERS = {'NorenOrdNum','ExchOrdNum','ExchSeqNum','ExchSeqNumS','FillId','Eref','StreamId','NorenKidId','InteropKey','ParticId'}
MASKED_IDS = {'UserId','SrcUserId','ExchUserId','ExchUserInfo','FamilyId','PanNum','UiDevCode'}
WITHHELD = {'OrdRemarks','FixRemarks'}
# The rejection reason is the diagnosis on a rejected order, so it is shown, but
# only through mask_reason (client codes, balances and holdings masked). Like
# the withheld fields it stays out of SEARCH_FIELDS and FACET_FIELDS.
MASKED_TEXT = {'RejReason'}


def field_value(doc, field):
    value = doc
    for part in field.split('.'):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def event_time(doc):
    value = doc.get('NorenTimeStamp')
    if value is None:
        return None
    try:
        return datetime.fromtimestamp(int(value) + int(doc.get('NorenNsecs') or 0) / 1e9, timezone.utc).isoformat()
    except (TypeError, ValueError, OverflowError, OSError):
        return None


def project(doc, kind, record_number):
    if kind in ('login', 'logout'):
        values = normalize_session_event(doc, source_row=record_number)['journal_fields']
        return {field: values.get(field) for field in SCHEMAS[kind]}
    values = {}
    for field in SCHEMAS[kind]:
        value = field_value(doc, field)
        if field == 'Record No.':
            value = record_number
        elif field == 'Event Time (UTC)':
            value = event_time(doc)
        elif field == 'Keys':
            # Preserve positional structure; identities in slots 1/2 are masked.
            value = [mask_id(str(v), 2) if i in (1,2) and v else v for i,v in enumerate(value)] if isinstance(value,list) else None
        elif field in ('AcctId','ExchSegAcctId'):
            value = mask_account(str(value)) if value is not None else None
        elif field in MASKED_IDS:
            value = mask_id(str(value), 4) if value is not None else None
        elif field == 'IpAddr':
            value = mask_ip(str(value)) if value is not None else None
        elif field in MASKED_TEXT:
            value = mask_reason(value) if value not in (None, '') else None
        elif field in WITHHELD:
            value = '[redacted]' if value not in (None, '') else None
        elif isinstance(value, (dict, list)):
            value = '[structured value; see flattened columns]'
        elif value is not None and (field in IDENTIFIERS or isinstance(value, int) and not isinstance(value, bool) and abs(value) >= 10**15):
            value = str(value)
        values[field] = value
    return values


def snapshot(path):
    """Masked per-kind projections, cached per file identity (mtime, size)."""
    st = Path(path).stat()
    return _snapshot(path, st.st_mtime_ns, st.st_size)


snapshot.cache_clear = lambda: _snapshot.cache_clear()  # type: ignore[attr-defined]


@lru_cache(maxsize=1)
def _snapshot(path, _mtime_ns, _size):
    items = {kind: [] for kind in SCHEMAS}
    counts = Counter()
    lines = records = 0
    with Path(path).open(encoding='utf-8') as stream:
        for line_number, line in enumerate(stream, 1):
            lines = line_number
            if not line.strip():
                continue
            doc = json.loads(line)
            if not isinstance(doc, dict):
                raise ValueError('Journal records must be JSON objects')
            records += 1
            kind = str(doc.get('msg_type', 'unknown'))
            counts[kind] += 1
            if kind in items:
                items[kind].append({'source_line': line_number, 'fields': project(doc, kind, counts[kind])})
    return {'source': 'journal snapshot', 'source_file': Path(path).name, 'source_lines': lines,
            'converted_records': records, 'parse_errors': 0, 'counts': dict(counts), 'items': items}


def selected_rows(data, kind, q=''):
    needle = q.casefold()
    for row in data['items'][kind]:
        if not needle or needle in json.dumps(row['fields'], ensure_ascii=False).casefold():
            yield row


def export_csv(data, kind, q=''):
    buffer=io.StringIO(); writer=csv.writer(buffer)
    writer.writerow(SCHEMAS[kind]); yield buffer.getvalue(); buffer.seek(0); buffer.truncate(0)
    for i,row in enumerate(selected_rows(data,kind,q),1):
        values = [row['fields'].get(field) for field in SCHEMAS[kind]]
        writer.writerow([safe_csv_cell(json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v) for v in values])
        if i % 500 == 0:
            yield buffer.getvalue(); buffer.seek(0); buffer.truncate(0)
    if buffer.tell():
        yield buffer.getvalue()
