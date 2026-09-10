"""Explicit snapshot evidence endpoints; no upload, polling or source writes."""
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from app.auth import current_user, require
from app.config import settings
from app.journal_evidence import SCHEMAS, PERMISSIONS, snapshot, selected_rows, export_csv
from app.journal_explore import FACET_FIELDS, explore

router=APIRouter(prefix='/api/journal', tags=['Journal evidence'])
Kind=Literal['ordupd','login','logout','yel_connected']


def data():
    if not settings.journal_path or not Path(settings.journal_path).is_file():
        raise HTTPException(503,'Journal file unavailable')
    try:
        return snapshot(settings.journal_path)
    except (ValueError,OSError):
        raise HTTPException(503,'Journal could not be parsed completely') from None


def allowed(user,kind):
    perms=user.get('permissions',[])
    if '*' not in perms and PERMISSIONS[kind] not in perms:
        raise HTTPException(403,'Your role does not grant access to this message type')


@router.get('/catalog')
def catalog(user=Depends(require('dashboard:read'))):
    result=data();perms=user.get('permissions',[])
    return {k:v for k,v in result.items() if k!='items'} | {'schemas':SCHEMAS,'allowed_types':[kind for kind in SCHEMAS if '*' in perms or PERMISSIONS[kind] in perms],
      'note':'One source JSON record per row. UTC comes from NorenTimeStamp; absent timestamps remain blank. Identifiers are text and sensitive fields are masked. Prices retain raw source units in this evidence view.'}


@router.get('/records')
def records(msg_type: Kind='ordupd',q: str=Query('',max_length=128),limit: int=Query(50,ge=1,le=500),offset: int=Query(0,ge=0,le=2_000_000),user=Depends(current_user)):
    allowed(user,msg_type);result=data();rows=list(selected_rows(result,msg_type,q))
    return {'source':'journal snapshot','msg_type':msg_type,'columns':SCHEMAS[msg_type],'count':len(rows),'limit':limit,'offset':offset,'items':rows[offset:offset+limit]}


@router.get('/records/export')
def export(msg_type: Kind='ordupd',q: str=Query('',max_length=128),user=Depends(current_user)):
    allowed(user,msg_type);result=data()
    return StreamingResponse(export_csv(result,msg_type,q),media_type='text/csv',headers={'Content-Disposition':f'attachment; filename="journal-{msg_type}.csv"','Cache-Control':'no-store'})


def parse_facets(kind, values):
    """`field:value` pairs into {field: [values]}, rejecting unknown fields."""
    allowed_fields = set(FACET_FIELDS.get(kind, ()))
    selected = {}
    for item in values or []:
        field, _, value = item.partition(':')
        if not _ or field not in allowed_fields:
            raise HTTPException(400, 'Unknown facet field')
        selected.setdefault(field, []).append(value)
    return selected


@router.get('/explore')
def explore_records(
    msg_type: Kind = 'ordupd',
    q: str = Query('', max_length=128),
    facet: list[str] = Query(default_factory=list, max_length=32),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0, le=2_000_000),
    user=Depends(current_user),
):
    allowed(user, msg_type)
    if not settings.journal_path or not Path(settings.journal_path).is_file():
        raise HTTPException(503, 'Journal file unavailable')
    try:
        return explore(settings.journal_path, msg_type, parse_facets(msg_type, facet), q, limit, offset)
    except (ValueError, OSError):
        raise HTTPException(503, 'Journal could not be parsed completely') from None
