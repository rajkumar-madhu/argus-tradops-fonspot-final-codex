"""Authenticated file analytics. Ingestion is operator-driven, never an HTTP write."""
from datetime import datetime
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.auth import require
from app.config import settings
from app.file_analytics import FileAnalytics

router=APIRouter(prefix='/api/files',tags=['File analytics'])
_store: FileAnalytics | None = None


def initialize():
    global _store
    if settings.csv_dir:
        _store=FileAnalytics(settings.csv_cache_path,settings.csv_dir,max_bytes=settings.csv_max_bytes,unit=settings.csv_latency_unit,max_rows=settings.csv_max_rows)
        _store.ingest()
        from app.metrics import CSV_LAST_IMPORT, CSV_QUEUE_LAST_EVENT, CSV_QUEUE_HAS_DATA
        CSV_LAST_IMPORT.set(datetime.now().timestamp())
        latest = {}
        for item in _store.queues()["items"]:
            stamp = datetime.fromisoformat(item["last_observed"]).timestamp() if item.get("last_observed") else 0
            latest[item["instance"]] = max(latest.get(item["instance"], 0), stamp)
        for instance, stamp in latest.items():
            CSV_QUEUE_LAST_EVENT.labels(instance=instance).set(stamp)
            CSV_QUEUE_HAS_DATA.labels(instance=instance).set(int(stamp > 0))


def store():
    if _store is None:
        raise HTTPException(503,'File analytics is not configured. Configure the CSV source directory and restart the API.')
    return _store


def filters(segment: str=Query('',max_length=32), q: str=Query('',max_length=128),
            start: datetime | None=None,end: datetime | None=None,status: str=Query('',max_length=32)):
    for dt in (start,end):
        if dt is not None and dt.tzinfo is None:raise HTTPException(422,'Time bounds must include a timezone offset')
    if start and end and start>end:raise HTTPException(422,'Start must be before end')
    return dict(segment=segment,q=q,start=start.timestamp() if start else None,end=end.timestamp() if end else None,status=status)


@router.get('/sources')
def sources(user=Depends(require('dashboard:read'))):
    return store().sources()


@router.get('/latency')
def latency(f=Depends(filters),limit: int=Query(50,ge=1,le=500),offset: int=Query(0,ge=0,le=2_000_000),
            sort: Literal['time','oms','confirmation','order_id','segment']='time',direction: Literal['asc','desc']='desc',user=Depends(require('latency:read'))):
    return store().latency(**f,limit=limit,offset=offset,sort=sort,direction=direction)


@router.get('/latency/export')
def export(f=Depends(filters),sort: Literal['time','oms','confirmation','order_id','segment']='time',direction: Literal['asc','desc']='desc',user=Depends(require('latency:read'))):
    # Authenticate and resolve store before streaming response headers.
    selected=store()
    return StreamingResponse(selected.export_latency(**f,sort=sort,direction=direction),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="argus-latency-filtered.csv"','Cache-Control':'no-store'})


@router.get('/queues')
def queues(instance: str=Query('',max_length=128),f=Depends(filters),user=Depends(require('latency:read'))):
    return store().queues(instance=instance,start=f['start'],end=f['end'])


@router.get('/queues/export')
def export_queues(instance: str=Query('',max_length=128),f=Depends(filters),user=Depends(require('latency:read'))):
    selected=store()
    return StreamingResponse(selected.export_queues(instance=instance,start=f['start'],end=f['end']),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="argus-queues-filtered.csv"','Cache-Control':'no-store'})
