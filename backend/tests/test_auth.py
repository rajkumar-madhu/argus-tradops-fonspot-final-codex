"""Authorization policy tests for app.auth.

app.auth imports PyJWT and FastAPI at module scope. Both exist in the backend
image CI runs these in; neither can be installed in the local sandbox, so when
they are missing a minimal stand-in is registered before the import. The
stand-ins only satisfy the import statement - every behaviour asserted below is
pure dict/set logic or the permission branch in require(), so the assertions
mean the same thing whether the real packages are present or not.
"""
import re
import sys
import types
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]


def _install_dotenv_shim():
    """app.config calls load_dotenv() at import time; the real package only
    copies .env into os.environ, and every Settings used here is constructed
    explicitly, so a no-op stand-in changes nothing that is asserted."""
    try:
        import dotenv  # noqa: F401
        return
    except ImportError:
        pass
    shim = types.ModuleType("dotenv")
    shim.load_dotenv = lambda *args, **kwargs: False
    sys.modules["dotenv"] = shim


def _install_jwt_shim():
    try:
        import jwt  # noqa: F401
        return
    except ImportError:
        pass
    shim = types.ModuleType("jwt")

    class PyJWKClient:
        def __init__(self, uri, *args, **kwargs):
            self.uri = uri

        def get_signing_key_from_jwt(self, token):
            raise RuntimeError("no JWKS endpoint in tests")

    def decode(*args, **kwargs):
        raise RuntimeError("no signature verification in tests")

    shim.PyJWKClient = PyJWKClient
    shim.decode = decode
    sys.modules["jwt"] = shim


def _install_fastapi_shim():
    try:
        import fastapi  # noqa: F401
        return
    except ImportError:
        pass

    class HTTPException(Exception):
        def __init__(self, status_code, detail=None):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    def Depends(dependency=None):
        return dependency

    class Request:
        pass

    fastapi = types.ModuleType("fastapi")
    fastapi.HTTPException = HTTPException
    fastapi.Depends = Depends
    fastapi.Request = Request
    fastapi.status = types.SimpleNamespace(HTTP_403_FORBIDDEN=403, HTTP_401_UNAUTHORIZED=401)

    security = types.ModuleType("fastapi.security")

    class HTTPAuthorizationCredentials:
        def __init__(self, scheme="Bearer", credentials=""):
            self.scheme = scheme
            self.credentials = credentials

    class HTTPBearer:
        def __init__(self, auto_error=True):
            self.auto_error = auto_error

    security.HTTPAuthorizationCredentials = HTTPAuthorizationCredentials
    security.HTTPBearer = HTTPBearer
    fastapi.security = security
    sys.modules["fastapi"] = fastapi
    sys.modules["fastapi.security"] = security


_install_dotenv_shim()
_install_jwt_shim()
_install_fastapi_shim()

from fastapi import HTTPException  # noqa: E402
from fastapi.security import HTTPAuthorizationCredentials  # noqa: E402

from app import auth  # noqa: E402
from app.config import Settings  # noqa: E402


class FakeRequest:
    """Only the two attributes _extract_token reads."""

    def __init__(self, cookies=None, query_params=None):
        self.cookies = cookies or {}
        self.query_params = query_params or {}


def enforcing_settings(**overrides):
    return Settings(auth_disabled=False, keycloak_client_id="tradeops-web", **overrides)


class RoleResolutionTests(unittest.TestCase):
    def test_realm_and_client_roles_are_merged(self):
        payload = {
            "realm_access": {"roles": ["risk"]},
            "resource_access": {"tradeops-web": {"roles": ["auditor"]}},
        }
        with mock.patch.object(auth, "settings", enforcing_settings()):
            self.assertEqual(auth._roles(payload), {"risk", "auditor"})

    def test_roles_from_another_client_are_ignored(self):
        payload = {
            "realm_access": {"roles": ["risk"]},
            "resource_access": {"some-other-client": {"roles": ["super_admin"]}},
        }
        with mock.patch.object(auth, "settings", enforcing_settings()):
            self.assertEqual(auth._roles(payload), {"risk"})

    def test_missing_claims_yield_no_roles(self):
        with mock.patch.object(auth, "settings", enforcing_settings()):
            self.assertEqual(auth._roles({}), set())


class PermissionMappingTests(unittest.TestCase):
    def test_super_admin_is_a_wildcard(self):
        self.assertEqual(auth._permissions({"super_admin"}), {"*"})

    def test_unknown_role_grants_nothing(self):
        self.assertEqual(auth._permissions({"not-a-role"}), set())

    def test_multiple_roles_union_their_permissions(self):
        self.assertEqual(
            auth._permissions({"risk", "infra_sre"}),
            auth.ROLE_PERMISSIONS["risk"] | auth.ROLE_PERMISSIONS["infra_sre"],
        )

    def test_risk_is_deliberately_excluded_from_latency(self):
        # Latency is an ops concern; see the Order Latency commit.
        self.assertNotIn("latency:read", auth.ROLE_PERMISSIONS["risk"])
        for role in ("trading_ops", "infra_sre", "auditor"):
            self.assertIn("latency:read", auth.ROLE_PERMISSIONS[role])

    def test_no_role_other_than_super_admin_holds_a_wildcard(self):
        for role, perms in auth.ROLE_PERMISSIONS.items():
            if role != "super_admin":
                self.assertNotIn("*", perms, f"{role} must not hold a wildcard")


class RequireTests(unittest.TestCase):
    def test_matching_permission_returns_the_user(self):
        user = {"permissions": ["orders:read"]}
        self.assertIs(auth.require("orders:read")(user=user), user)

    def test_wildcard_satisfies_any_permission(self):
        user = {"permissions": ["*"]}
        self.assertIs(auth.require("reports:read")(user=user), user)

    def test_missing_permission_is_403(self):
        with self.assertRaises(HTTPException) as raised:
            auth.require("reports:read")(user={"permissions": ["orders:read"]})
        self.assertEqual(raised.exception.status_code, 403)

    def test_403_names_the_permission_and_the_roles_that_grant_it(self):
        with self.assertRaises(HTTPException) as raised:
            auth.require("orders:read")(user={"permissions": ["dashboard:read"], "roles": ["risk", "offline_access"]})
        detail = raised.exception.detail
        self.assertEqual(detail["permission"], "orders:read")
        self.assertEqual(detail["granted_by"], ["auditor", "super_admin", "trading_ops"])
        # Only TradeOps roles are echoed: a shared realm's defaults are noise, not a diagnosis.
        self.assertEqual(detail["app_roles"], ["risk"])
        self.assertEqual(detail["client_id"], auth.settings.keycloak_client_id)

    def test_403_with_no_app_role_reports_an_empty_list(self):
        with self.assertRaises(HTTPException) as raised:
            auth.require("dashboard:read")(user={"permissions": [], "roles": ["default-roles-devops-common-cicd"]})
        self.assertEqual(raised.exception.detail["app_roles"], [])

    def test_a_permission_is_not_a_prefix_match(self):
        with self.assertRaises(HTTPException):
            auth.require("orders:read")(user={"permissions": ["orders"]})


class TokenExtractionTests(unittest.TestCase):
    def test_header_wins_over_cookie_and_query(self):
        request = FakeRequest({"tradeops_token": "cookie"}, {"access_token": "query"})
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="header")
        self.assertEqual(auth._extract_token(request, credentials), "header")

    def test_cookie_wins_over_query(self):
        request = FakeRequest({"tradeops_token": "cookie"}, {"access_token": "query"})
        self.assertEqual(auth._extract_token(request, None), "cookie")

    def test_query_param_is_the_last_resort(self):
        request = FakeRequest({}, {"access_token": "query"})
        self.assertEqual(auth._extract_token(request, None), "query")

    def test_no_token_anywhere_is_none(self):
        self.assertIsNone(auth._extract_token(FakeRequest(), None))

    def test_empty_credentials_fall_through_to_the_cookie(self):
        request = FakeRequest({"tradeops_token": "cookie"})
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="")
        self.assertEqual(auth._extract_token(request, credentials), "cookie")


class CurrentUserTests(unittest.TestCase):
    def test_auth_disabled_short_circuits_to_super_admin(self):
        with mock.patch.object(auth, "settings", Settings(auth_disabled=True)):
            user = auth.current_user(FakeRequest(), None)
        self.assertEqual(user["permissions"], ["*"])
        self.assertEqual(user["roles"], ["super_admin"])

    def test_missing_token_is_401(self):
        with mock.patch.object(auth, "settings", enforcing_settings()):
            with self.assertRaises(HTTPException) as raised:
                auth.current_user(FakeRequest(), None)
        self.assertEqual(raised.exception.status_code, 401)

    def test_verification_failure_is_401_with_a_bounded_detail(self):
        long_reason = "x" * 400

        def exploding_client():
            raise RuntimeError(long_reason)

        with mock.patch.object(auth, "settings", enforcing_settings()), \
                mock.patch.object(auth, "jwks_client", exploding_client):
            request = FakeRequest({"tradeops_token": "a.b.c"})
            with self.assertRaises(HTTPException) as raised:
                auth.current_user(request, None)
        self.assertEqual(raised.exception.status_code, 401)
        self.assertLessEqual(len(raised.exception.detail), len("Invalid token: ") + 120)


class JwksClientTests(unittest.TestCase):
    def tearDown(self):
        auth.jwks_client.cache_clear()

    def test_jwks_fetch_does_not_identify_as_python_urllib(self):
        """Cloudflare on keycloak.finspot.in 403s the default urllib User-Agent,
        so token verification fails after an otherwise successful SSO login."""
        auth.jwks_client.cache_clear()
        captured = {}

        def fake_client(uri, *args, **kwargs):
            captured["uri"] = uri
            captured["kwargs"] = kwargs
            return mock.Mock()

        with mock.patch.object(auth, "PyJWKClient", fake_client), \
                mock.patch.object(auth, "settings", enforcing_settings(
                    keycloak_url="https://keycloak.finspot.in",
                    keycloak_realm="Devops-common-cicd",
                )):
            auth.jwks_client()

        headers = captured.get("kwargs", {}).get("headers") or {}
        user_agent = headers.get("User-Agent", "")
        self.assertTrue(user_agent, "JWKS client must send a User-Agent")
        self.assertNotIn("urllib", user_agent.lower())


class FrontendParityTests(unittest.TestCase):
    """CLAUDE.md requires ROLE_PERMISSIONS to mirror the frontend ROLE_ROUTES.

    Skipped in CI: the backend image mounts only backend/tests, so the frontend
    source is not on disk there.
    """

    ROUTE_PERMISSIONS = {
        "/dashboard": "dashboard:read",
        "/orders": "orders:read",
        "/order-book": "orders:read",
        "/trades": "trades:read",
        "/positions": "positions:read",
        "/holdings": "holdings:read",
        "/rejections": "rejections:read",
        "/rca": "rca:read",
        "/market-data": "market:read",
        "/exchange": "exchange:read",
        "/sessions": "sessions:read",
        "/logs": "logs:read",
        "/order-latency": "latency:read",
        "/queue-monitor": "latency:read",
        "/data-quality": "dashboard:read",
        "/risk": "risk:read",
        "/infra": "infra:read",
        "/incidents": "incidents:read",
        "/reports": "reports:read",
    }

    def _frontend_role_routes(self):
        source = REPO_ROOT / "frontend" / "lib" / "auth.ts"
        if not source.exists():
            self.skipTest("frontend source not mounted in this environment")
        block = re.search(r"ROLE_ROUTES:\s*Record<[^>]*>\s*=\s*\{(.*?)\n\};", source.read_text(), re.S)
        self.assertIsNotNone(block, "ROLE_ROUTES literal not found in frontend/lib/auth.ts")
        routes = {}
        for role, body in re.findall(r"(\w+):\s*\[(.*?)\]", block.group(1), re.S):
            routes[role] = set(re.findall(r'"([^"]+)"', body))
        return routes

    def test_every_frontend_route_maps_to_a_known_permission(self):
        for role, paths in self._frontend_role_routes().items():
            for path in paths:
                if path == "*":
                    continue
                self.assertIn(path, self.ROUTE_PERMISSIONS, f"{role} route {path} has no backend permission")

    def test_role_names_match_on_both_sides(self):
        self.assertEqual(set(self._frontend_role_routes()), set(auth.ROLE_PERMISSIONS))

    def test_each_role_sees_exactly_what_it_is_permitted(self):
        for role, paths in self._frontend_role_routes().items():
            if "*" in paths:
                self.assertEqual(auth.ROLE_PERMISSIONS[role], {"*"})
                continue
            expected = {self.ROUTE_PERMISSIONS[p] for p in paths}
            self.assertEqual(
                auth.ROLE_PERMISSIONS[role],
                expected,
                f"{role}: backend and frontend disagree",
            )


if __name__ == "__main__":
    unittest.main()
