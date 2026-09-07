from __future__ import annotations
import hashlib
from datetime import datetime, timezone
from typing import Any
from sqlalchemy import desc, select
from sqlalchemy.dialects.postgresql import insert
from app.db import db_session
from app.models import Incident, RCACase


def _now() -> datetime:
    return datetime.now(timezone.utc)


def incident_fingerprint(incident_type: str, key: str) -> str:
    return hashlib.sha256(f"{incident_type}|{key}".encode()).hexdigest()


def upsert_incident(*, incident_type: str, key: str, title: str, severity: str, evidence: dict[str, Any], source: str = "event-bus") -> dict[str, Any]:
    fp = incident_fingerprint(incident_type, key)
    now = _now()
    stmt = insert(Incident).values(
        fingerprint=fp,
        incident_key=key,
        severity=severity,
        incident_type=incident_type,
        title=title,
        status="OPEN",
        occurrence_count=1,
        source=source,
        evidence=evidence,
        first_seen=now,
        last_seen=now,
        created_at=now,
        updated_at=now,
    ).on_conflict_do_update(
        index_elements=[Incident.fingerprint],
        set_={
            "severity": severity,
            "title": title,
            "status": "OPEN",
            "occurrence_count": Incident.occurrence_count + 1,
            "evidence": evidence,
            "last_seen": now,
            "updated_at": now,
        },
    ).returning(Incident)
    with db_session() as db:
        row = db.execute(stmt).scalar_one()
        return incident_to_dict(row)


def upsert_rca(case: dict[str, Any]) -> dict[str, Any]:
    order_id = str(case.get("order_id") or "")
    summary = case.get("summary") or {}
    confidence = float(summary.get("confidence") or 0)
    now = _now()
    stmt = insert(RCACase).values(
        order_id=order_id,
        status="OPEN",
        category=summary.get("category"),
        code=summary.get("code"),
        probable_cause=summary.get("probable_cause"),
        confidence_bp=int(max(0, min(1, confidence)) * 10000),
        summary=summary,
        evidence=case.get("evidence") or [],
        correlation=case.get("correlation") or {},
        source=case.get("source") or "noren-correlation",
        created_at=now,
        updated_at=now,
    ).on_conflict_do_update(
        index_elements=[RCACase.order_id],
        set_={
            "status": "OPEN",
            "category": summary.get("category"),
            "code": summary.get("code"),
            "probable_cause": summary.get("probable_cause"),
            "confidence_bp": int(max(0, min(1, confidence)) * 10000),
            "summary": summary,
            "evidence": case.get("evidence") or [],
            "correlation": case.get("correlation") or {},
            "source": case.get("source") or "noren-correlation",
            "updated_at": now,
        },
    ).returning(RCACase)
    with db_session() as db:
        row = db.execute(stmt).scalar_one()
        return rca_to_dict(row)


def list_incidents(limit: int = 100, status: str | None = None) -> list[dict[str, Any]]:
    with db_session() as db:
        stmt = select(Incident)
        if status:
            stmt = stmt.where(Incident.status == status.upper())
        stmt = stmt.order_by(desc(Incident.last_seen)).limit(limit)
        return [incident_to_dict(x) for x in db.scalars(stmt).all()]


def list_rca(limit: int = 100) -> list[dict[str, Any]]:
    with db_session() as db:
        stmt = select(RCACase).order_by(desc(RCACase.updated_at)).limit(limit)
        return [rca_to_dict(x) for x in db.scalars(stmt).all()]


def get_rca(order_id: str) -> dict[str, Any] | None:
    with db_session() as db:
        row = db.scalar(select(RCACase).where(RCACase.order_id == order_id))
        return rca_to_dict(row) if row else None


def incident_to_dict(x: Incident) -> dict[str, Any]:
    return {
        "id": x.id, "fingerprint": x.fingerprint, "key": x.incident_key,
        "severity": x.severity, "type": x.incident_type, "title": x.title,
        "status": x.status, "occurrence_count": x.occurrence_count, "source": x.source,
        "evidence": x.evidence, "first_seen": x.first_seen.isoformat() if x.first_seen else None,
        "last_seen": x.last_seen.isoformat() if x.last_seen else None,
    }


def rca_to_dict(x: RCACase) -> dict[str, Any]:
    return {
        "id": x.id, "order_id": x.order_id, "status": x.status,
        "category": x.category, "code": x.code, "probable_cause": x.probable_cause,
        "confidence": x.confidence_bp / 10000.0, "summary": x.summary,
        "evidence": x.evidence, "correlation": x.correlation, "source": x.source,
        "created_at": x.created_at.isoformat() if x.created_at else None,
        "updated_at": x.updated_at.isoformat() if x.updated_at else None,
    }
