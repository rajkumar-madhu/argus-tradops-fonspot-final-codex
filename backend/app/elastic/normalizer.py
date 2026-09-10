from __future__ import annotations
import re
import hashlib
from app.session_fields import SESSION_JOURNAL_FIELDS, REDACTED_SESSION_FIELDS
from datetime import datetime, timezone
from typing import Any
from app.config import settings


def _first(doc: dict[str, Any], *names: str, default: Any = "") -> Any:
    for name in names:
        cur: Any = doc
        ok = True
        for part in name.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                ok = False
                break
        if ok and cur not in (None, ""):
            return cur
    return default


def mask_ip(value: str) -> str:
    if not value:
        return ""
    parts = str(value).split(".")
    return ".".join(parts[:2] + ["x", "xxx"]) if len(parts) == 4 else "***"


def mask_id(value: str, keep: int = 4) -> str:
    value = str(value or "")
    if len(value) <= keep:
        return "***" if value else ""
    return value[:keep] + "***"


def mask_account(value: str) -> str:
    value = str(value or "")
    if not value:
        return ""
    if "-" in value:
        left, right = value.rsplit("-", 1)
        return (left[:2] + "***" if len(left) > 2 else "***") + "-" + right
    return mask_id(value, 2)


# Rejection reasons are free text written by the RMS/OMS. They carry the
# diagnosis (rule, circuit limits, freeze qty) but also client identity and
# money. mask_reason keeps the former and masks the latter. Market figures
# (Current/LowerCircuit/UpperCircuit prices, freeze Set/Current qty) and the
# bracketed product group ("[RISK-CSB]") are not client data and stay readable.
_REASON_RULES: tuple[tuple[re.Pattern[str], str], ...] = (
    # "for C-S476-KBC", "for C-99999ACH-CSB^EQT": client code, broker suffix kept.
    (re.compile(r"\bC-[A-Z0-9]+(-[A-Z]{2,})(\^[A-Z]+)?"), r"C-***\1"),
    # "clientid D999-BJT", "Account K999-VRD"
    (re.compile(r"\b(clientid|Account)(\s+)[A-Z0-9]+(-[A-Z]{2,})", re.IGNORECASE), r"\1\2***\3"),
    # "NON-COMPLIANT CLIENT CODE : G9999"
    (re.compile(r"(CLIENT CODE\s*:\s*)\S+", re.IGNORECASE), r"\1***"),
    # "Continuous Debit[ 9999999-ISB M ]": the account leads the bracket.
    (re.compile(r"(\[\s*)[A-Z]*\d[A-Z0-9]*(-[A-Z]{2,})"), r"\1***\2"),
    # Balances, shortfalls and margins. Circuit prices are market data.
    (re.compile(r"(?<!Current:)(?<!LowerCircuit:)(?<!UpperCircuit:)\bINR\s*-?[\d,]+(?:\.\d+)?"), "INR ***"),
    # A client's holding quantity.
    (re.compile(r"(Eligible Sell\s*:\s*)\d+", re.IGNORECASE), r"\1***"),
    # PAN, 10-digit phone numbers, IPv4 addresses.
    (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "***"),
    (re.compile(r"\b\d{10}\b"), "***"),
    (re.compile(r"\b(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}\b"), r"\1.x.xxx"),
)


def mask_reason(value: Any) -> str:
    """Rejection reason with client identity and money masked; empty stays empty."""
    text = str(value or "")
    for pattern, replacement in _REASON_RULES:
        text = pattern.sub(replacement, text)
    return text


def _iso_from_unix(seconds: Any, nsecs: Any = 0) -> str:
    try:
        sec = int(seconds)
        ns = int(nsecs or 0)
        dt = datetime.fromtimestamp(sec + ns / 1_000_000_000, tz=timezone.utc)
        return dt.isoformat()
    except Exception:
        return ""


def _price(value: Any) -> float | None:
    try:
        return round(float(value) / settings.noren_price_divisor, 4)
    except Exception:
        return None


def _latency_ms(doc: dict[str, Any]) -> float | None:
    try:
        now = int(doc.get("NorenTimeStamp", 0)) * 1_000_000_000 + int(doc.get("NorenNsecs", 0))
        org = int(doc.get("NorenOrgTimeStamp", 0)) * 1_000_000_000 + int(doc.get("NorenOrgNsecs", 0))
        if now > 0 and org > 0 and now >= org:
            return round((now - org) / 1_000_000, 3)
    except Exception:
        pass
    return None


def rejection_code(reason: str) -> str:
    reason = str(reason or "").strip()
    m = re.match(r"^([A-Z]{2,8}|\d{3,8})\s*[:\-]", reason)
    return m.group(1) if m else ("RMS" if reason.startswith("RED:") else "")


def rejection_category(reason: str) -> str:
    text = str(reason or "").strip().lower()
    if not text:
        return ""
    if "margin shortfall" in text or "peak margin" in text or "shortfall:" in text:
        return "RMS / Margin"
    # Price-band and quantity-freeze rules. Deliberately new categories, not
    # members of the correlation worker's P2 set.
    if "circuit limit" in text:
        return "RMS / Circuit Limit"
    if "freeze qty" in text:
        return "RMS / Freeze Qty"
    if "nonsq" in text or "block type" in text:
        return "RMS / Risk Block"
    if "holding" in text:
        return "RMS / Holdings"
    if "mwpl" in text or "regulatory" in text or "collateral" in text or "rrm mode" in text or "non-compliant client" in text:
        return "RMS / Regulatory"
    if "market" in text and ("not open" in text or "opened" in text):
        return "Market State"
    if text.startswith("saf:") or "yel" in text:
        return "Gateway / YEL"
    if text.startswith("ora:"):
        return "OMS / Order Rule"
    if "cancel" in text:
        return "Cancellation"
    if re.match(r"^\d{3,8}\s*:", text):
        return "Exchange"
    return "Other"


def order_status(doc: dict[str, Any]) -> str:
    code = doc.get("OrdStatus")
    reason = str(doc.get("RejReason") or "").strip()
    if code in (56, 65):
        return "REJECTED"
    if code == 52:
        return "CANCELLED"
    if code == 50:
        return "COMPLETE"
    if code == 48:
        try:
            total = int(doc.get("TotalFillQty") or 0)
            qty = int(doc.get("QtyToFill") or 0)
            if total and qty and total < qty:
                return "PARTIAL"
        except Exception:
            pass
        return "OPEN"
    if code == 54:
        return "TRIGGER_PENDING"
    if code in (109, 110, 115):
        return "PENDING"
    if reason:
        return "REJECTED"
    return f"STATUS_{code}" if code is not None else "UNKNOWN"


def normalize_order(doc: dict[str, Any], *, mask_sensitive: bool = True) -> dict[str, Any]:
    account = str(doc.get("AcctId") or "")
    user_id = str(doc.get("UserId") or "")
    reason = str(doc.get("RejReason") or "").strip()
    return {
        "order_id": str(doc.get("NorenOrdNum") or ""),
        "eref": str(doc.get("Eref") or ""),
        "exchange_order_id": str(doc.get("ExchOrdNum") or ""),
        "time": _iso_from_unix(doc.get("NorenTimeStamp"), doc.get("NorenNsecs")),
        "exchange_time": _iso_from_unix(doc.get("ExchTimeStamp"), doc.get("ExchNsecs")),
        "original_time": _iso_from_unix(doc.get("NorenOrgTimeStamp"), doc.get("NorenOrgNsecs")),
        "status": order_status(doc),
        "status_code": doc.get("OrdStatus"),
        "report_type": doc.get("ReportType"),
        "account": mask_account(account) if mask_sensitive else account,
        "user": mask_id(user_id, 4) if mask_sensitive else user_id,
        "broker": str(doc.get("BrokerId") or ""),
        "region": str(doc.get("Region") or ""),
        "exchange": str(doc.get("ExchSeg") or ""),
        "symbol": str(doc.get("TradingSymbol") or ""),
        "token": str(doc.get("Token") or ""),
        "side": "BUY" if doc.get("TransType") == "B" else ("SELL" if doc.get("TransType") == "S" else str(doc.get("TransType") or "")),
        "type": str(doc.get("PriceType") or ""),
        "product": str(doc.get("Product") or ""),
        "duration": str(doc.get("OrdDuration") or ""),
        "qty": doc.get("QtyToFill") or 0,
        "filled_qty": doc.get("TotalFillQty") or doc.get("FillQty") or 0,
        "cancelled_qty": doc.get("CancelledQty") or 0,
        "price": _price(doc.get("PriceToFill")),
        "fill_price": _price(doc.get("FillAvgPrice") or doc.get("FillPrice")),
        "latency_ms": _latency_ms(doc),
        "code": rejection_code(reason),
        "reason": reason,
        "rejection_category": rejection_category(reason),
        "source": "noren-ordupd",
    }


def _session_result(status_text: str) -> str:
    text = str(status_text or "").strip()
    if not text:
        return "—"
    if "success" in text.lower():
        return "Success"
    return text


def normalize_session_event(
    doc: dict[str, Any],
    *,
    mask_sensitive: bool = True,
    source_row: int | None = None,
) -> dict[str, Any]:
    details = doc.get("Userdetails") if isinstance(doc.get("Userdetails"), dict) else {}
    exch = details.get("UserExchDetails") if isinstance(details.get("UserExchDetails"), list) else []
    segments = [str(x.get("ExchSeg")) for x in exch if isinstance(x, dict) and x.get("Enable", True) and x.get("ExchSeg")]
    sess = str(doc.get("UserSessId") or details.get("UserSessId") or "")
    user_id = str(doc.get("UserId") or details.get("UserId") or "")
    products = details.get("Products") if isinstance(details.get("Products"), list) else []
    order_types = details.get("UserOrdTypes") if isinstance(details.get("UserOrdTypes"), list) else []
    status_text = str(doc.get("ReqStatus") or "")
    msg_type = str(doc.get("msg_type") or "")
    active = msg_type == "login" and "success" in status_text.lower()
    row: dict[str, Any] = {
        "event": msg_type,
        "active": active,
        "status": status_text,
        "result": _session_result(status_text),
        "time": _iso_from_unix(doc.get("NorenTimeStamp"), doc.get("NorenNsecs")),
        "user_id": mask_id(user_id, 4) if mask_sensitive else user_id,
        "broker": str(details.get("BrokerId") or ""),
        "region": str(details.get("Region") or ""),
        "access_type": str(doc.get("AccessType") or ""),
        "privilege": doc.get("UserPrivilege") or details.get("UserPrivilege") or "",
        "access_group": str(details.get("UserAccessGrp") or ""),
        "segments": segments,
        "products": products,
        "order_types": order_types,
        "app_version": str(details.get("NorenAppVersion") or ""),
        "session_id": "[redacted]" if sess else "",
        "session_key": hashlib.sha256(sess.encode()).hexdigest() if sess else "",
        "login_process": "[redacted]" if doc.get("LoginProcId") else "",
        "source": f"noren-{msg_type}",
    }
    if source_row is not None:
        row["source_row"] = source_row
    fields = {}
    for field in SESSION_JOURNAL_FIELDS:
        value = _first(doc, field, default=None)
        if field == "Record No.":
            value = source_row
        elif field == "Event Time (UTC)":
            value = row["time"]
        elif field in REDACTED_SESSION_FIELDS:
            value = "[redacted]" if value is not None else None
        elif field in ("UserId", "Userdetails.UserId"):
            value = mask_id(str(value), 4) if value is not None else None
        elif field in ("Userdetails.LastLoginIp", "Userdetails.UserIpAddr"):
            value = mask_ip(str(value)) if value is not None else None
        elif field == "Userdetails.AcctIds":
            # Account structures may contain credentials; retain only masked IDs.
            value = [mask_account(str(v)) for v in value if isinstance(v, (str, int))] if isinstance(value, list) else (mask_account(str(value)) if isinstance(value, (str, int)) else None)
        elif field == "Userdetails.UserExchDetails":
            value = [{k: item[k] for k in ("ExchSeg", "Enable") if k in item and isinstance(item[k], (str, bool, int))} for item in value if isinstance(item, dict)] if isinstance(value, list) else None
        elif field == "Userdetails.UserMws":
            value = f"{len(value)} entries" if isinstance(value, (list, dict)) else None
        elif isinstance(value, list):
            value = [item for item in value if isinstance(item, (str, int, float, bool))]
        elif isinstance(value, dict):
            value = "[structured value withheld]"
        fields[field] = value
    row["journal_fields"] = fields
    row["masked_fields"] = sorted(REDACTED_SESSION_FIELDS | {"UserId", "Userdetails.UserId", "Userdetails.AcctIds"})
    return row


def normalize_log(doc: dict[str, Any]) -> dict[str, Any]:
    mt = str(doc.get("msg_type") or "journal")
    if mt == "ordupd":
        o = normalize_order(doc)
        return {
            "@timestamp": o["time"], "level": "ERROR" if o["status"] == "REJECTED" else "INFO",
            "service": "noren-ordupd", "host": "", "order_id": o["order_id"], "user_id": o["user"],
            "exchange": o["exchange"], "symbol": o["symbol"], "error_code": o["code"],
            "message": o["reason"] or f"Order {o['status']} ({o['status_code']})",
        }
    if mt in {"login", "logout"}:
        s = normalize_session_event(doc)
        return {
            "@timestamp": s["time"], "level": "INFO", "service": f"noren-{mt}", "host": "", "order_id": "",
            "user_id": s["user_id"], "exchange": ",".join(s["segments"]), "symbol": "", "error_code": "",
            "message": f"{mt} {s['status']}",
        }
    return {
        "@timestamp": _first(doc, "@timestamp", default=""), "level": "INFO", "service": f"noren-{mt}", "host": "",
        "order_id": "", "user_id": "", "exchange": "", "symbol": "", "error_code": "",
        "message": f"Noren event: {mt}",
    }


# Backward compatibility
normalize_session = normalize_session_event


# ---------------------------------------------------------------------------
# Order latency feed (L_ORDERLATENCY*.csv)
#
# !! UNRESOLVED — DO NOT ROUTE THROUGH order_status() !!
#
# The latency feed's OMS_STATUS codes CONTRADICT the Noren OrdStatus codes this
# module maps in order_status() above:
#
#     code | latency feed generator | order_status() (Noren OrdStatus)
#     -----+------------------------+---------------------------------
#       65 | COMPLETE               | REJECTED
#       56 | OPEN                   | REJECTED
#       48 | AFTER_MARKET_ORDER     | OPEN / PARTIAL
#       45 | REJECTED               | (unmapped)
#       50 | (unmapped)             | COMPLETE
#
# The labels below follow the FEED's own mapping and are treated as a separate
# namespace ("OMS status"), never as Noren order status. This is provisional:
# the owner of the latency feed has not yet confirmed which mapping is
# authoritative. If it turns out the feed should use Noren semantics, change
# ONLY this dict — nothing else reads these codes.
# ---------------------------------------------------------------------------

OMS_STATUS_LABELS: dict[int, str] = {
    65: "COMPLETE",
    56: "OPEN",
    45: "REJECTED",
    48: "AFTER_MARKET_ORDER",
}

#: True while the mapping above is unconfirmed; the API surfaces this so the UI
#: can label the column as provisional rather than silently asserting it.
OMS_STATUS_MAPPING_CONFIRMED = False


def oms_status_label(code: Any) -> str:
    """Label an OMS_STATUS code from the latency feed. Unknown codes render as-is."""
    try:
        return OMS_STATUS_LABELS.get(int(code), f"CODE_{int(code)}")
    except (TypeError, ValueError):
        return "UNKNOWN"


def exch_confirm_label(code: Any) -> str:
    """EXCH_STATUS: 48 is confirmation evidence; blank/zero has no evidence."""
    raw = str(code or "").strip()
    if raw in ("", "0"):
        return "NOT_CONFIRMED"
    try:
        return "CONFIRMED" if int(float(raw)) == 48 else f"CODE_{raw}"
    except (TypeError, ValueError):
        return "UNKNOWN"
