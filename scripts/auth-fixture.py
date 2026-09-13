#!/usr/bin/env python3
"""Loopback-only OIDC fixture using the real FastAPI JWT verification path.

Run: backend/.venv/bin/python scripts/auth-fixture.py --port 18103 --ui-port 13103
Synthetic users/data only. Signing keys and single-use codes live in RAM, are
never logged or written, and are discarded on exit. Never deploy this script.
"""
import argparse
import asyncio
import base64
import hashlib
import html
import json
import os
from pathlib import Path
import secrets
import sys
import time
from urllib.parse import parse_qs, urlencode

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--port', type=int, default=18103)
parser.add_argument('--ui-port', type=int, default=13103)
args = parser.parse_args()
origin = f'http://127.0.0.1:{args.port}'
ui = f'http://localhost:{args.ui_port}'
issuer = f'{origin}/realms/fixture'
oidc_path = '/realms/fixture/protocol/openid-connect'
os.environ.update({
    'PYTHON_DOTENV_DISABLED': '1', 'AUTH_DISABLED': 'false',
    'TRADEOPS_DEMO_MODE': 'true', 'TRADEOPS_ENV': 'development',
    'KEYCLOAK_URL': origin, 'KEYCLOAK_REALM': 'fixture',
    'KEYCLOAK_CLIENT_ID': 'tradeops-web', 'KEYCLOAK_VERIFY_AUDIENCE': 'true',
    'CORS_ORIGINS': json.dumps([ui]), 'AUTO_CREATE_SCHEMA': 'false',
    'TRADEOPS_JOURNAL_PATH': '', 'TRADEOPS_CSV_DIR': '',
    'ELASTICSEARCH_URL': 'http://127.0.0.1:1', 'ELASTICSEARCH_API_KEY': '',
    'ELASTICSEARCH_PASSWORD': '', 'REDIS_URL': 'redis://127.0.0.1:1/0',
    'DATABASE_URL': 'postgresql+psycopg://fixture@127.0.0.1:1/fixture',
    'TRUEDATA_ENABLED': 'false',
})
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import jwt
import uvicorn
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from app.main import app

key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
public_key = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(key.public_key()))
public_key.update(kid='fixture-only', use='sig', alg='RS256')
codes = {}
fixture_mode = 'normal'


@app.post('/fixture/state')
async def fixture_state(request: Request):
    global fixture_mode
    mode = (await request.json()).get('mode')
    if mode not in {'normal', 'empty', 'overview-error', 'auth-unavailable', 'slow-overview'}:
        return JSONResponse({'error': 'invalid_fixture_mode'}, status_code=400)
    fixture_mode = mode
    return {'mode': fixture_mode}


@app.middleware('http')
async def response_scenarios(request: Request, call_next):
    path = request.url.path
    if fixture_mode == 'auth-unavailable' and path == '/api/auth/me':
        return JSONResponse({'detail': 'Fixture verification outage'}, status_code=503)
    if fixture_mode == 'overview-error' and path == '/api/overview':
        return JSONResponse({'detail': 'Fixture overview outage'}, status_code=503)
    if fixture_mode == 'slow-overview' and path == '/api/overview':
        await asyncio.sleep(6)
    # Preserve the real auth dependencies first, then replace only successful
    # synthetic data responses. Unauthorized requests still fail in app.auth.
    result = await call_next(request)
    if fixture_mode == 'empty' and result.status_code == 200:
        headers = {k: v for k, v in result.headers.items() if k.lower().startswith('access-control-')}
        if path == '/api/overview':
            return JSONResponse({'source': 'demo', 'orders': 0, 'complete': 0, 'rejected': 0, 'open': 0, 'pending': 0, 'sessions': {}, 'exchanges': []}, headers=headers)
        if path in {'/api/orders', '/api/rejections', '/api/exchanges', '/api/sessions'}:
            return JSONResponse({'source': 'demo', 'items': [], 'orders': [], 'groups': [], 'count': 0, 'rejected_unique_orders': 0, 'active_count': 0}, headers=headers)
    return result


@app.get(oidc_path + '/certs')
def certs():
    return {'keys': [public_key]}


@app.get(oidc_path + '/auth')
def authorize(request: Request):
    p = request.query_params
    if p.get('redirect_uri') != f'{ui}/auth/callback' or p.get('client_id') != 'tradeops-web' or p.get('code_challenge_method') != 'S256' or not p.get('state'):
        return JSONResponse({'error': 'invalid_request'}, status_code=400)
    fields = ''.join(f'<input type="hidden" name="{html.escape(k)}" value="{html.escape(v, quote=True)}">' for k, v in p.items())
    return HTMLResponse(f'''<!doctype html><title>Local OIDC test fixture</title>
      <main><h1>Local OIDC test fixture</h1><p>Synthetic accounts only. No password is collected.</p>
      <form action="/fixture/authorize" method="get">{fields}
      <button name="identity" value="trading_ops">Sign in as trading operations</button>
      <button name="identity" value="super_admin">Sign in as test administrator</button>
      <button name="identity" value="risk">Sign in as risk</button>
      <button name="identity" value="unassigned">Sign in without application roles</button>
      <button name="identity" value="short">Sign in with a short session</button>
      <button name="identity" value="invalid">Reject invalid credentials</button>
      <button name="identity" value="wrong-audience">Issue token for another audience</button>
      </form></main>''')


@app.get('/fixture/authorize')
def approve(request: Request):
    p = request.query_params
    if p.get('redirect_uri') != f'{ui}/auth/callback':
        return JSONResponse({'error': 'invalid_request'}, status_code=400)
    if p.get('identity') == 'invalid':
        return RedirectResponse(f'{ui}/auth/callback?' + urlencode({'error': 'access_denied', 'state': p.get('state', '')}))
    code = secrets.token_urlsafe(24)
    codes[code] = dict(p) | {'created': time.time()}
    return RedirectResponse(f'{ui}/auth/callback?' + urlencode({'code': code, 'state': p.get('state', '')}))


@app.post(oidc_path + '/token')
async def exchange(request: Request):
    p = {k: v[0] for k, v in parse_qs((await request.body()).decode()).items()}
    record = codes.pop(p.get('code', ''), None)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(p.get('code_verifier', '').encode()).digest()).decode().rstrip('=')
    if not record or time.time() - record['created'] > 60 or record.get('code_challenge') != challenge or p.get('redirect_uri') != f'{ui}/auth/callback' or p.get('client_id') != 'tradeops-web' or p.get('grant_type') != 'authorization_code':
        return JSONResponse({'error': 'invalid_grant'}, status_code=400)
    identity = record.get('identity')
    roles = [] if identity == 'unassigned' else [identity if identity in {'risk', 'trading_ops', 'super_admin'} else 'trading_ops']
    ttl = 8 if identity == 'short' else 300
    now = int(time.time())
    claims = {'sub': 'fixture-user', 'preferred_username': 'Local test user',
              'iss': issuer, 'aud': 'other-client' if identity == 'wrong-audience' else 'tradeops-web',
              'azp': 'tradeops-web', 'iat': now, 'exp': now + ttl, 'realm_access': {'roles': roles}}
    token = jwt.encode(claims, key, algorithm='RS256', headers={'kid': 'fixture-only'})
    return JSONResponse({'access_token': token, 'token_type': 'Bearer', 'expires_in': ttl}, headers={'Cache-Control': 'no-store'})


@app.get(oidc_path + '/logout')
def logout(request: Request):
    if request.query_params.get('post_logout_redirect_uri') != f'{ui}/signin':
        return JSONResponse({'error': 'invalid_request'}, status_code=400)
    return RedirectResponse(f'{ui}/signin')


if __name__ == '__main__':
    # No access logging: callback/code/token query values must stay private even
    # in this synthetic environment. The app logs route templates/status only.
    uvicorn.run(app, host='127.0.0.1', port=args.port, access_log=False)
