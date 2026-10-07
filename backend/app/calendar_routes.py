"""Read-only calendar over masked, tenant-scoped order snapshots and incidents."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
import csv
import io
import json
import zipfile
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from app import tenancy
from app.auth import require
from app.config import settings
from app.cache import ttl_cache
from app.elastic.client import get_es
from app.elastic.noren_service import _order_sort
from app.elastic.normalizer import mask_reason, normalize_order

router = APIRouter()
ZONE = ZoneInfo("Asia/Kolkata")
LIMIT = 5000
OPEN = {"OPEN", "PENDING", "TRIGGER_PENDING", "PARTIAL"}
ORDER_FIELDS = ("order_id", "time", "status", "symbol", "exchange", "account", "broker", "qty", "filled_qty", "price", "code", "rejection_category")


def moment(value):
    try:
        parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def date_range(start, end, latest=None):
    today = datetime.now(ZONE).date()
    last = min(latest.astimezone(ZONE).date(), today) if latest else today
    def parse(value, default):
        if not value:
            return default
        try:
            return date.fromisoformat(value)
        except ValueError:
            raise HTTPException(422, "Use ISO dates (YYYY-MM-DD)")
    last = min(parse(end, last), today)
    first = parse(start, last - timedelta(days=29))
    if first > last or (last - first).days >= 30:
        raise HTTPException(422, "Select a range of 1 to 30 days")
    return first, last, today


def bounds(first, last):
    a = datetime.combine(first, time.min, ZONE).astimezone(timezone.utc)
    b = datetime.combine(last + timedelta(days=1), time.min, ZONE).astimezone(timezone.utc)
    return a.isoformat(), (b - timedelta(microseconds=1)).isoformat()


def service(row):
    category = str(row.get("rejection_category") or "")
    if category.startswith("RMS"):
        return "Risk Management"
    if category in {"Exchange", "Market State", "Gateway / YEL"}:
        return "Exchange Gateway"
    return "Order Management"


def matches(row, account, exchange, selected_service):
    return ((not account or row.get("account") == account)
            and (not exchange or row.get("exchange") == exchange)
            and (not selected_service or service(row) == selected_service))


@ttl_cache(15)
def live_rows(first, last):
    es = get_es()
    if es is None:
        return {"items": [], "count": 0, "source": "demo"}
    a, b = bounds(first, last)
    result = es.search(index=settings.noren_order_index, body={
        "size": LIMIT, "query": {"range": {settings.noren_timestamp_field: {"gte": a, "lte": b}}},
        "sort": _order_sort(True), "collapse": {"field": "NorenOrdNum"},
        "_source": {"excludes": ["PanNum", "IpAddr", "ExchUserInfo", "ParticId"]},
        "aggs": {"unique_orders": {"cardinality": {"field": "NorenOrdNum", "precision_threshold": 40000}}},
    })
    rows = [normalize_order(hit.get("_source", {})) for hit in result.get("hits", {}).get("hits", [])]
    return {"items": rows, "count": result.get("aggregations", {}).get("unique_orders", {}).get("value", len(rows)), "source": "elasticsearch"}


def order_source(start, end):
    from app import main
    from app.journal_snapshot import load_journal
    def journal():
        snapshot = load_journal(main._journal_path())
        first, last, today = date_range(start, end, moment(snapshot.get("to")))
        rows = [row for row in snapshot["items"] if (stamp := moment(row.get("time"))) and first <= stamp.astimezone(ZONE).date() <= last]
        return {"items": rows, "count": len(rows), "source": "journal snapshot", "window": (first, last, today)}
    def live():
        es = get_es()
        latest = None
        if es is not None:
            result = es.search(index=settings.noren_order_index, body={"size": 0, "aggs": {"latest": {"max": {"field": settings.noren_timestamp_field}}}})
            latest = moment(result.get("aggregations", {}).get("latest", {}).get("value_as_string"))
        if main.DEMO_MODE and tenancy.current_id() == tenancy.DEFAULT_ID:
            latest = max((stamp for row in main.DEMO_ORDERS if (stamp := moment(row.get("time")))), default=None)
        first, last, today = date_range(start, end, latest)
        if main.DEMO_MODE and tenancy.current_id() == tenancy.DEFAULT_ID:
            rows = [row for row in main.DEMO_ORDERS if (stamp := moment(row.get("time"))) and first <= stamp.astimezone(ZONE).date() <= last]
            return {"items": rows, "count": len(rows), "source": "demo", "window": (first, last, today)}
        return {**live_rows(first, last), "window": (first, last, today)}
    try:
        result = main._with_data_source(live, journal)
        if result.get("source") == "demo" and (not main.DEMO_MODE or tenancy.current_id() != tenancy.DEFAULT_ID):
            raise HTTPException(503, "Order source unavailable")
        return result
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(503, "Calendar order source unavailable")


def permitted(user, permission):
    return "*" in user.get("permissions", []) or permission in user.get("permissions", [])


def calendar_payload(user, start=None, end=None, selected=None, account="", exchange="", selected_service=""):
    allowed = permitted(user, "orders:read")
    raw = order_source(start, end) if allowed else {"items": [], "count": 0, "source": "unavailable", "window": date_range(start, end)}
    first, last, today = raw["window"]
    try:
        chosen = date.fromisoformat(selected) if selected else last
    except ValueError:
        raise HTTPException(422, "Use an ISO selected date")
    chosen = min(max(chosen, first), last)
    rows = raw["items"]
    filtered = [r for r in rows if matches(r, account, exchange, selected_service)]
    complete = allowed and raw["count"] <= len(rows)
    buckets = {}
    cursor = first
    while cursor <= last:
        a, b = bounds(cursor, cursor)
        buckets[cursor.isoformat()] = {"date": cursor.isoformat(), "orders": 0, "executed": 0, "open_pending": 0, "rejected": 0, "alerts": 0, "from_time": a, "to_time": b, "orders_available": allowed, "alerts_available": False, "complete": complete}
        cursor += timedelta(days=1)
    for row in filtered:
        stamp = moment(row.get("time"))
        bucket = buckets.get(stamp.astimezone(ZONE).date().isoformat()) if stamp else None
        if not bucket:
            continue
        state = str(row.get("status") or "").upper()
        bucket["orders"] += 1
        bucket["executed"] += state == "COMPLETE"
        bucket["open_pending"] += state in OPEN
        bucket["rejected"] += state == "REJECTED"
    detail_rows = filtered
    detail_truncated = False
    # A date click gets its own bounded query, so an earlier day does not lose
    # all its detail just because the range sample ends on a busy newer day.
    if allowed and raw["source"] == "elasticsearch":
        try:
            detail_source = live_rows(chosen, chosen)
        except Exception:
            raise HTTPException(503, "Selected day order source unavailable")
        detail_rows = [r for r in detail_source["items"] if matches(r, account, exchange, selected_service)]
        detail_truncated = detail_source["count"] > len(detail_source["items"])
    detail = []
    for row in detail_rows:
        stamp = moment(row.get("time"))
        if stamp and stamp.astimezone(ZONE).date() == chosen:
            detail.append({**{k: row.get(k) for k in ORDER_FIELDS}, "service": service(row), "local_time": stamp.astimezone(ZONE).isoformat(), "rejection_reason": mask_reason(str(row.get("reason") or ""))})
    detail_truncated = detail_truncated or len(detail) > LIMIT
    alerts = []
    alerts_available = False
    alerts_complete = False
    if permitted(user, "incidents:read") and tenancy.current_id() == tenancy.DEFAULT_ID and not any((account, exchange, selected_service)):
        from app.repository import list_incidents
        from app.elastic.normalizer import mask_id
        try:
            incident_rows = list_incidents(limit=500, status=None)
            alerts_available = True
            alerts_complete = len(incident_rows) < 500
            for row in incident_rows:
                stamp = moment(row.get("first_seen"))
                bucket = buckets.get(stamp.astimezone(ZONE).date().isoformat()) if stamp else None
                if bucket:
                    bucket["alerts"] += 1
                    if stamp.astimezone(ZONE).date() == chosen:
                        alerts.append({"fingerprint": row.get("fingerprint"), "name": mask_reason(str(row.get("title") or row.get("type") or "Incident")), "severity": row.get("severity"), "first_seen": stamp.isoformat(), "local_time": stamp.astimezone(ZONE).isoformat(), "detail": "Persisted operational incident", "component": mask_id(str(row.get("key") or "")), "resource": "", "source": "incidents"})
        except Exception:
            pass  # unavailable is carried explicitly; it is never a healthy zero
    for day in buckets.values():
        day["alerts_available"] = alerts_available
    stamps = [s for row in rows if (s := moment(row.get("time")))]
    return {"window": {"start": first.isoformat(), "end": last.isoformat(), "today": today.isoformat(), "days": len(buckets)}, "selected_date": chosen.isoformat(), "timezone": "Asia/Kolkata", "tenant": {"id": tenancy.current_id(), "name": tenancy.current().name}, "days": list(buckets.values()), "detail": {"orders": detail[:LIMIT], "alerts": alerts}, "detail_truncated": detail_truncated, "filters": {"accounts": sorted({str(r.get("account")) for r in rows if r.get("account")}), "exchanges": sorted({str(r.get("exchange")) for r in rows if r.get("exchange")}), "services": sorted({service(r) for r in rows})}, "source": raw["source"], "fallback": raw.get("fallback"), "source_count": raw["count"], "returned": len(rows), "complete": complete, "alerts_complete": alerts_complete, "sample_data": raw["source"] == "demo", "freshness": {"state": "delayed" if raw.get("fallback") else "file" if raw["source"] == "journal snapshot" else "unknown", "last_seen": max(stamps).isoformat() if stamps else None}}


def export_calendar(payload, kind):
    columns = ["date", "orders", "executed", "open_pending", "rejected", "alerts", "orders_available", "alerts_available", "complete"]
    rows = [[day[key] if (key not in {"orders", "executed", "open_pending", "rejected"} or day["orders_available"]) and (key != "alerts" or day["alerts_available"]) else "" for key in columns] for day in payload["days"]]
    filename = f'argus-calendar-{payload["window"]["start"]}-{payload["window"]["end"]}.{kind}'
    headers = {"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"}
    if kind == "csv":
        out = io.StringIO(); writer = csv.writer(out); writer.writerow(columns); writer.writerows(rows)
        return Response(out.getvalue(), media_type="text/csv", headers=headers)
    out = io.BytesIO()
    table = [columns] + rows
    xml_rows = []
    for n, row in enumerate(table, 1):
        cells = []
        for i, value in enumerate(row):
            ref = f'{chr(65+i)}{n}'
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                cells.append(f'<c r="{ref}"><v>{value}</v></c>')
            else:
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>')
        xml_rows.append(f'<row r="{n}">{"".join(cells)}</row>')
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        z.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        z.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Calendar" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join(xml_rows)+'</sheetData></worksheet>')
    return Response(out.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@router.get("/api/calendar")
def calendar(start: str | None = Query(None), end: str | None = Query(None), date: str | None = Query(None), account: str = Query("", max_length=100), exchange: str = Query("", max_length=30), service: str = Query("", max_length=40), format: str | None = Query(None, pattern="^(csv|xlsx)$"), user=Depends(require("dashboard:read"))):
    payload = calendar_payload(user, start, end, date, account, exchange, service)
    return export_calendar(payload, format) if format else payload
