"""Multi-tenancy: access policy, source confinement, cache isolation and the
request binding that carries the tenant from the HTTP request into sync endpoints.

Pure unit tests except the ASGI ones, which drive a FastAPI app in-process (no
httpx/TestClient needed) to prove the ContextVar reaches threadpool code.
"""
import asyncio
import json
import os
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    import fastapi  # noqa: F401
    from fastapi import Depends, FastAPI, HTTPException
    from fastapi.responses import StreamingResponse
    HAVE_FASTAPI = True
except ModuleNotFoundError:
    HAVE_FASTAPI = False

if HAVE_FASTAPI:
    from app import tenancy
    from app.cache import clear as clear_cache, ttl_cache


async def asgi_get(app, path, headers=None):
    """Minimal ASGI client: returns (status, body bytes)."""
    raw_path, _, query = path.partition("?")
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET", "scheme": "http",
        "path": raw_path, "raw_path": raw_path.encode(), "query_string": query.encode(), "root_path": "",
        "headers": [(b"host", b"test")] + [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": ("127.0.0.1", 1), "server": ("test", 80),
    }
    messages = []
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": b"", "more_body": False}
        await asyncio.sleep(3600)

    async def send(message):
        messages.append(message)

    await app(scope, receive, send)
    status = next(m["status"] for m in messages if m["type"] == "http.response.start")
    body = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return status, body


def T(tid, **kw):
    return tenancy.Tenant(id=tid, name=tid.title(), **kw)


@unittest.skipUnless(HAVE_FASTAPI, "fastapi not installed")
class TenancyTestCase(unittest.TestCase):
    def setUp(self):
        self._settings = tenancy.settings
        self._rows, self._grants = tenancy.load_rows, tenancy.load_grants
        tenancy.invalidate()
        self._token = tenancy.bind(tenancy.DEFAULT_ID)

    def tearDown(self):
        tenancy.unbind(self._token)
        tenancy.settings = self._settings
        tenancy.load_rows, tenancy.load_grants = self._rows, self._grants
        tenancy.invalidate()
        clear_cache()

    def multi(self, rows=(), grants=None, **overrides):
        tenancy.settings = replace(self._settings, multi_tenant=True, demo_mode=False, **overrides)
        tenancy.load_rows = lambda: list(rows)
        tenancy.load_grants = lambda principals: set((grants or {}).get(principals, set()))
        tenancy.invalidate()


class AccessPolicyTests(TenancyTestCase):
    user = {"sub": "u-1", "preferred_username": "Priya", "email": "priya@acme.in", "permissions": ["orders:read"]}

    def test_public_payload_includes_journal_primary(self):
        self.multi(journal_primary=True, journal_path="/data/journal/Journal.log", es_url="http://localhost:9200")
        pub = tenancy.default_tenant().public()
        self.assertTrue(pub["journal_primary"])
        self.assertEqual(pub["sources"], {"elasticsearch": True, "journal": True})
        live = T("finspot-ind", es_url="http://es.example:9200", credentials_ref="finspot-ind")
        self.assertFalse(live.journal_primary)
        self.assertFalse(live.public()["journal_primary"])
        self.assertEqual(live.public()["sources"], {"elasticsearch": True, "journal": False})

    def test_single_tenant_mode_only_knows_default(self):
        self.assertEqual(tenancy.allowed_ids(self.user), ["default"])
        self.assertTrue(tenancy.assert_access(self.user).is_default)
        tenancy.bind("acme")
        with self.assertRaises(HTTPException) as raised:
            tenancy.assert_access(self.user)
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(raised.exception.detail["available"], ["default"])

    def test_granted_user_sees_only_granted_tenants(self):
        principals = tenancy.principals(self.user)
        self.assertEqual(principals, ("priya", "priya@acme.in", "u-1"), "lower-cased username, email and sub")
        self.multi(rows=[T("acme", es_url="https://es.acme"), T("zeta", es_url="https://es.zeta")], grants={principals: {"acme"}})
        self.assertEqual(tenancy.allowed_ids(self.user), ["acme"])
        tenancy.bind("acme")
        self.assertEqual(tenancy.assert_access(self.user).id, "acme")
        tenancy.bind("zeta")
        with self.assertRaises(HTTPException) as raised:
            tenancy.assert_access(self.user)
        self.assertEqual(raised.exception.detail["available"], ["acme"])

    def test_default_needs_a_grant_once_multi_tenant_is_on(self):
        self.multi(rows=[T("acme", es_url="https://es.acme")])
        with self.assertRaises(HTTPException):
            tenancy.assert_access(self.user)  # bound to default, no grants

    def test_wildcard_permission_sees_every_tenant(self):
        self.multi(rows=[T("acme", es_url="https://es.acme"), T("zeta", journal_path="z.log")])
        self.assertEqual(tenancy.allowed_ids({"permissions": ["*"]}), ["default", "acme", "zeta"])

    def test_grants_for_a_disabled_or_unknown_tenant_do_not_count(self):
        principals = tenancy.principals(self.user)
        self.multi(rows=[T("acme", es_url="https://es.acme")], grants={principals: {"acme", "gone"}})
        self.assertEqual(tenancy.allowed_ids(self.user), ["acme"])

    def test_registry_or_grant_failures_fail_closed(self):
        self.multi()
        tenancy.load_rows = mock.Mock(side_effect=RuntimeError("db down"))
        tenancy.load_grants = mock.Mock(side_effect=RuntimeError("db down"))
        self.assertEqual(set(tenancy.tenants()), {"default"})
        self.assertEqual(tenancy.allowed_ids(self.user), [])

    def test_a_failed_refresh_keeps_the_last_good_registry(self):
        self.multi(rows=[T("acme", es_url="https://es.acme")])
        self.assertIn("acme", tenancy.tenants())
        tenancy.load_rows = mock.Mock(side_effect=RuntimeError("db blip"))
        with mock.patch.object(tenancy.time, "monotonic", return_value=tenancy.time.monotonic() + 60):
            self.assertIn("acme", tenancy.tenants())

    def test_malformed_tenant_values_are_rejected_not_coerced(self):
        self.assertEqual(tenancy.normalize(" ACME "), "acme")
        self.assertEqual(tenancy.normalize("../etc"), tenancy._INVALID)
        self.assertIsNone(tenancy.normalize(""))
        self.multi(rows=[T("acme", es_url="https://es.acme")])
        tenancy.bind(tenancy.normalize("acme;drop"))
        with self.assertRaises(HTTPException) as raised:
            tenancy.assert_access({"permissions": ["*"]})
        self.assertIsNone(raised.exception.detail["tenant"])

    def test_shared_feature_guard(self):
        tenancy.require_default_tenant("Live streams")
        tenancy.bind("acme")
        with self.assertRaises(HTTPException) as raised:
            tenancy.require_default_tenant("Live streams")
        self.assertEqual(raised.exception.status_code, 404)


class SourceConfinementTests(TenancyTestCase):
    def test_tenant_journal_must_stay_inside_the_journal_dir(self):
        with tempfile.TemporaryDirectory() as base, tempfile.TemporaryDirectory() as outside:
            inside = Path(base, "acme", "Journal.log"); inside.parent.mkdir(); inside.write_text("{}\n")
            secret = Path(outside, "passwd"); secret.write_text("x")
            Path(base, "escape").symlink_to(outside)
            self.multi(rows=[T("acme", journal_path="acme/Journal.log"), T("evil", journal_path=str(secret)),
                             T("link", journal_path="escape/passwd"), T("dots", journal_path="../passwd")],
                       tenant_journal_dir=base)
            for tid, expected in (("acme", str(inside.resolve())), ("evil", None), ("link", None), ("dots", None)):
                tenancy.bind(tid)
                self.assertEqual(tenancy.journal_path(), expected, tid)

    def test_no_journal_dir_means_no_tenant_journals(self):
        self.multi(rows=[T("acme", journal_path="/tmp/Journal.log")], tenant_journal_dir="")
        tenancy.bind("acme")
        self.assertIsNone(tenancy.journal_path())

    def test_credentials_are_read_from_the_secret_dir_by_ref_only(self):
        with tempfile.TemporaryDirectory() as secrets:
            Path(secrets, "acme.es_api_key").write_text("key-1\n")
            Path(secrets, "basic.es_username").write_text("reader")
            Path(secrets, "basic.es_password").write_text("pw")
            Path(secrets, "half.es_username").write_text("reader")
            self.multi(tenant_secrets_dir=secrets)
            self.assertEqual(tenancy.es_credentials("acme"), {"api_key": "key-1"})
            self.assertEqual(tenancy.es_credentials("basic"), {"username": "reader", "password": "pw"})
            self.assertEqual(tenancy.es_credentials("half"), {}, "a username without a password is not a credential")
            self.assertEqual(tenancy.es_credentials("../acme"), {})
            self.assertEqual(tenancy.es_credentials(None), {})

    def test_admin_validation(self):
        with tempfile.TemporaryDirectory() as base:
            self.multi(tenant_journal_dir=base)
            v = tenancy.validate_tenant_fields
            self.assertEqual(v(tenant_id="acme", name="Acme", es_url="https://es.acme:9200", credentials_ref="acme"), [])
            self.assertTrue(v(tenant_id="default"))
            self.assertTrue(v(tenant_id="Acme Corp"))
            self.assertTrue(v(es_url="https://elastic:pw@es.acme"), "no credentials in the URL")
            self.assertTrue(v(es_url="file:///etc/passwd"))
            self.assertTrue(v(es_url="https://es.acme/?x=1"))
            self.assertTrue(v(credentials_ref="../x"))
            self.assertTrue(v(journal_path="/etc/passwd"))
            self.assertEqual(v(journal_path="acme/Journal.log"), [])
            tenancy.settings = replace(tenancy.settings, environment="production")
            self.assertTrue(v(es_url="http://es.acme"), "production requires https")


class IsolationTests(TenancyTestCase):
    def test_ttl_cache_does_not_serve_one_tenant_to_another(self):
        calls = []

        @ttl_cache(60)
        def summary(window):
            calls.append(tenancy.current_id())
            return {"tenant": tenancy.current_id()}

        self.assertEqual(summary("24h")["tenant"], "default")
        tenancy.bind("acme")
        self.assertEqual(summary("24h")["tenant"], "acme")
        self.assertEqual(summary("24h")["tenant"], "acme")
        self.assertEqual(calls, ["default", "acme"], "same arguments, one computation per tenant")

    def test_es_clients_are_per_tenant(self):
        from app.elastic import client as es_client
        with tempfile.TemporaryDirectory() as secrets:
            Path(secrets, "acme.es_api_key").write_text("key-a")
            Path(secrets, "zeta.es_api_key").write_text("key-z")
            self.multi(rows=[T("acme", es_url="https://es.acme", credentials_ref="acme"),
                             T("zeta", es_url="https://es.zeta", credentials_ref="zeta"),
                             T("file", journal_path="f.log")], tenant_secrets_dir=secrets)
            created = []
            with mock.patch.object(es_client, "Elasticsearch", side_effect=lambda **kw: created.append(kw) or object()), \
                 mock.patch.dict(es_client._tenant_clients, clear=True):
                tenancy.bind("acme"); a1 = es_client.get_es(); a2 = es_client.get_es()
                tenancy.bind("zeta"); z = es_client.get_es()
                tenancy.bind("file"); none = es_client.get_es()
                self.assertIs(a1, a2)
                self.assertIsNot(a1, z)
                self.assertIsNone(none, "a journal-only tenant has no cluster")
                self.assertEqual([(c["hosts"], c["api_key"]) for c in created], [(["https://es.acme"], "key-a"), (["https://es.zeta"], "key-z")])
                Path(secrets, "acme.es_api_key").write_text("key-a2")
                tenancy.bind("acme")
                self.assertIsNot(es_client.get_es(), a1, "a rotated key yields a new client")
                self.assertEqual(sum(1 for k in es_client._tenant_clients if k[0] == "acme"), 1, "the stale client is dropped")

    def test_field_resolution_cache_is_per_tenant(self):
        from app.elastic import noren_service
        caps = {"acme": {"BrokerId.keyword": {"keyword": {}}}, "zeta": {"BrokerId": {"keyword": {}}}}

        class FakeES:
            def __init__(self, tid): self.tid = tid
            def field_caps(self, **_): return {"fields": caps[self.tid]}

        with mock.patch.dict(noren_service._FIELD_CACHE, clear=True), \
             mock.patch.object(noren_service, "get_es", side_effect=lambda: FakeES(tenancy.current_id())):
            tenancy.bind("acme"); self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId.keyword")
            tenancy.bind("zeta"); self.assertEqual(noren_service._field("idx", "BrokerId"), "BrokerId")


class RequestBindingTests(TenancyTestCase):
    def test_context_reaches_sync_dependencies_endpoints_and_streams(self):
        app = FastAPI(dependencies=[Depends(tenancy.bind_request_tenant)])

        def sync_dep():
            return tenancy.current_id()

        @app.get("/api/sync")
        def sync_route(seen=Depends(sync_dep)):
            return {"dep": seen, "endpoint": tenancy.current_id()}

        @app.get("/api/async")
        async def async_route():
            return {"endpoint": tenancy.current_id()}

        @app.get("/api/stream")
        async def stream_route():
            async def gen():
                yield tenancy.current_id().encode()
            return StreamingResponse(gen())

        @app.get("/health")
        def health():
            return {"endpoint": tenancy.current_id()}

        async def scenario():
            return [
                await asgi_get(app, "/api/sync", {"X-TradeOps-Tenant": "acme"}),
                await asgi_get(app, "/api/sync"),
                await asgi_get(app, "/api/async?tenant=zeta"),
                await asgi_get(app, "/api/sync", {"Cookie": "tradeops_tenant=kbc"}),
                await asgi_get(app, "/api/sync", {"X-TradeOps-Tenant": "acme", "Cookie": "tradeops_tenant=kbc"}),
                await asgi_get(app, "/api/stream", {"X-TradeOps-Tenant": "acme"}),
                await asgi_get(app, "/health", {"X-TradeOps-Tenant": "acme"}),
            ]

        r = asyncio.run(scenario())
        self.assertEqual(json.loads(r[0][1]), {"dep": "acme", "endpoint": "acme"}, "header reaches sync dep and threadpool endpoint")
        self.assertEqual(json.loads(r[1][1]), {"dep": "default", "endpoint": "default"}, "no bleed from the previous request")
        self.assertEqual(json.loads(r[2][1]), {"endpoint": "zeta"}, "query parameter for EventSource")
        self.assertEqual(json.loads(r[3][1])["endpoint"], "kbc", "cookie")
        self.assertEqual(json.loads(r[4][1])["endpoint"], "acme", "header beats cookie")
        self.assertEqual(r[5][1], b"acme", "streaming body sees the tenant")
        self.assertEqual(json.loads(r[6][1])["endpoint"], "default", "non-API paths are never tenant-scoped")

    def test_real_app_refuses_an_ungranted_tenant_before_the_route_runs(self):
        os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://u:p@localhost:5432/x")
        from app import main

        async def scenario():
            return [
                await asgi_get(main.app, "/api/config"),
                await asgi_get(main.app, "/api/config", {"X-TradeOps-Tenant": "acme"}),
            ]

        first, second = asyncio.run(scenario())
        if first[0] != 200:
            self.skipTest("auth is enabled in this environment")
        self.assertEqual(json.loads(first[1])["tenant"]["id"], "default")
        self.assertEqual(second[0], 403)
        self.assertEqual(json.loads(second[1])["detail"]["message"], "Multi-tenancy is not enabled")

    def test_real_app_serves_the_bound_tenant_in_multi_tenant_mode(self):
        os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://u:p@localhost:5432/x")
        from app import main
        self.multi(rows=[T("acme", es_url="https://es.acme")])

        async def scenario():
            return [await asgi_get(main.app, "/api/config", {"X-TradeOps-Tenant": "acme"}),
                    await asgi_get(main.app, "/api/tenants", {"Cookie": "tradeops_tenant=gone"}),
                    await asgi_get(main.app, "/api/incidents", {"X-TradeOps-Tenant": "acme"})]

        config, listing, incidents = asyncio.run(scenario())
        if config[0] == 401:
            self.skipTest("auth is enabled in this environment")
        self.assertEqual(config[0], 200, config[1][:300])
        self.assertEqual(json.loads(config[1])["tenant"]["id"], "acme")
        self.assertFalse(json.loads(config[1])["csv_configured"], "CSV analytics belong to the default tenant")
        body = json.loads(listing[1])
        self.assertEqual(listing[0], 200, "a stale cookie must not lock the user out of the tenant list")
        self.assertEqual([t["id"] for t in body["items"]], ["default", "acme"])
        self.assertEqual(body["current"], "default")
        self.assertEqual(json.loads(incidents[1])["source"], "unavailable", "persisted incidents are the default tenant's")


class AdminWriteGuardTests(unittest.TestCase):
    """Cookie-authenticated cross-site writes must be refused (CSRF)."""

    def req(self, method, headers):
        from starlette.requests import Request
        return Request({"type": "http", "method": method, "path": "/api/admin/tenants", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()]})

    @unittest.skipUnless(HAVE_FASTAPI, "fastapi not installed")
    def test_writes_need_a_bearer_header_and_json(self):
        from app import tenant_routes
        from app.config import settings
        with mock.patch("app.config.settings", replace(settings, auth_disabled=False)):
            for method, headers, status in (
                ("POST", {"cookie": "tradeops_token=t", "content-type": "text/plain"}, 403),
                ("POST", {"authorization": "Bearer t", "content-type": "application/x-www-form-urlencoded"}, 415),
                ("DELETE", {"cookie": "tradeops_token=t"}, 403),
            ):
                with self.assertRaises(HTTPException) as raised:
                    tenant_routes.header_token_required(self.req(method, headers))
                self.assertEqual(raised.exception.status_code, status, (method, headers))
            tenant_routes.header_token_required(self.req("POST", {"authorization": "Bearer t", "content-type": "application/json"}))
            tenant_routes.header_token_required(self.req("DELETE", {"authorization": "Bearer t"}))

    @unittest.skipUnless(HAVE_FASTAPI, "fastapi not installed")
    def test_every_admin_write_route_carries_the_guard(self):
        from app import tenant_routes
        for route in tenant_routes.router.routes:
            if route.methods & {"POST", "PUT", "PATCH", "DELETE"}:
                deps = [d.dependency for d in route.dependencies]
                self.assertIn(tenant_routes.header_token_required, deps, f"{sorted(route.methods)} {route.path}")


class ConfigTests(unittest.TestCase):
    def test_multi_tenant_refuses_demo_mode(self):
        from app.config import Settings, multi_tenant_errors
        self.assertTrue(multi_tenant_errors(Settings(multi_tenant=True, demo_mode=True)))
        self.assertEqual(multi_tenant_errors(Settings(multi_tenant=True, demo_mode=False, environment="development")), [])
        self.assertEqual(multi_tenant_errors(Settings(multi_tenant=False, demo_mode=True)), [])


if __name__ == "__main__":
    unittest.main()
