import time
from functools import lru_cache
from typing import Callable
import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.config import settings

bearer = HTTPBearer(auto_error=False)

# Browsers cannot attach an Authorization header to an EventSource, so SSE
# endpoints have to carry the access token some other way. Both fallbacks below
# are accepted for every route; the cookie is the one the UI actually uses.
TOKEN_COOKIE = "tradeops_token"
TOKEN_QUERY_PARAM = "access_token"

ROLE_PERMISSIONS = {
    "super_admin": {"*"},
    "trading_ops": {"dashboard:read","orders:read","trades:read","positions:read","holdings:read","rejections:read","rca:read","market:read","exchange:read","sessions:read","logs:read"},
    "risk": {"dashboard:read","positions:read","holdings:read","rejections:read","rca:read","risk:read","market:read"},
    "infra_sre": {"dashboard:read","exchange:read","infra:read","logs:read","incidents:read","rca:read","sessions:read"},
    "auditor": {"dashboard:read","orders:read","trades:read","positions:read","holdings:read","rejections:read","rca:read","market:read","exchange:read","sessions:read","risk:read","infra:read","logs:read","incidents:read","reports:read"},
}

@lru_cache
def jwks_client():
    return PyJWKClient(settings.keycloak_jwks_url)

def _roles(payload: dict) -> set[str]:
    roles = set(payload.get("realm_access", {}).get("roles", []))
    client_roles = payload.get("resource_access", {}).get(settings.keycloak_client_id, {}).get("roles", [])
    roles.update(client_roles)
    return roles

def _permissions(roles: set[str]) -> set[str]:
    out=set()
    for role in roles: out.update(ROLE_PERMISSIONS.get(role, set()))
    return out

def _extract_token(request: Request, credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if credentials and credentials.credentials:
        return credentials.credentials
    cookie = request.cookies.get(TOKEN_COOKIE)
    if cookie:
        return cookie
    # Last resort for EventSource. Query strings end up in access logs, so the UI
    # only falls back to this when the cookie cannot be set (cross-site without
    # SameSite=None; Secure).
    return request.query_params.get(TOKEN_QUERY_PARAM) or None

def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if settings.auth_disabled:
        return {"sub":"demo-admin","preferred_username":"demo-admin","roles":["super_admin"],"permissions":["*"]}
    token = _extract_token(request, credentials)
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        key = jwks_client().get_signing_key_from_jwt(token).key
        payload = jwt.decode(token, key, algorithms=["RS256"], audience=settings.keycloak_client_id, issuer=settings.keycloak_issuer, options={"verify_aud": settings.keycloak_verify_audience})
        roles=_roles(payload); perms=_permissions(roles)
        return {"sub":payload.get("sub"),"preferred_username":payload.get("preferred_username"),"email":payload.get("email"),"roles":sorted(roles),"permissions":sorted(perms)}
    except Exception as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(exc)[:120]}")

def require(permission: str) -> Callable:
    def dep(user=Depends(current_user)):
        perms=set(user["permissions"])
        if "*" not in perms and permission not in perms:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")
        return user
    return dep
