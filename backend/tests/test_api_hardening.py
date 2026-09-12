import unittest
from unittest.mock import patch
from dataclasses import replace
from fastapi.testclient import TestClient
from app import main, auth, file_routes

class ApiHardeningTests(unittest.TestCase):
    def test_errors_do_not_echo_token_verification_details(self):
        with patch.object(auth, 'settings', replace(auth.settings, auth_disabled=False)), patch('app.auth.jwks_client', side_effect=RuntimeError('sensitive-provider-detail')):
            with self.assertRaises(Exception) as raised:
                auth.current_user(type('Request',(),{'cookies':{},'query_params':{}})(),type('Credentials',(),{'credentials':'invalid'})())
        self.assertNotIn('sensitive-provider-detail',str(raised.exception.detail))

    def test_security_headers_and_request_id(self):
        client=TestClient(main.app)
        r=client.get('/health',headers={'X-Request-ID':'unsafe<script>'})
        self.assertEqual(r.headers.get('x-content-type-options'),'nosniff')
        self.assertRegex(r.headers.get('x-request-id',''),r'^[a-f0-9]{32}$')
        self.assertEqual(r.headers.get('cache-control'),'no-store')

    def test_file_routes_exist_and_validate_inputs(self):
        client=TestClient(main.app)
        self.assertEqual(client.get('/api/files/latency?limit=99999').status_code,422)
        self.assertEqual(client.get('/api/files/latency?sort=DROP').status_code,422)
        self.assertEqual(client.get('/api/files/latency?start=not-a-date').status_code,422)

    def test_file_routes_require_permission_including_exports(self):
        client = TestClient(main.app)
        main.app.dependency_overrides[auth.current_user] = lambda: {'permissions': [], 'roles': []}
        try:
            for path in ('sources', 'latency', 'latency/export', 'queues', 'queues/export'):
                self.assertEqual(client.get('/api/files/' + path).status_code, 403, path)
        finally:
            main.app.dependency_overrides.pop(auth.current_user, None)

    def test_unconfigured_exports_and_invalid_time_bounds(self):
        client = TestClient(main.app)
        main.app.dependency_overrides[auth.current_user] = lambda: {'permissions': ['*'], 'roles': ['super_admin']}
        try:
            with patch.object(file_routes, '_store', None):
                self.assertEqual(client.get('/api/files/queues/export').status_code, 503)
                self.assertEqual(client.get('/api/files/latency/export').status_code, 503)
            for start, end in [('2026-09-08T00:00:00', ''), ('2026-09-09T00:00:00Z', '2026-09-08T00:00:00Z')]:
                params = {'start': start}
                if end:
                    params['end'] = end
                self.assertEqual(client.get('/api/files/latency', params=params).status_code, 422)
        finally:
            main.app.dependency_overrides.pop(auth.current_user, None)

    def test_exchange_events_do_not_invent_latency_or_venue_reject_rate(self):
        with patch.object(main,'_use_journal_data',return_value=False), patch.object(main,'DEMO_MODE',False), patch.object(main,'noren_overview',return_value={'reject_rate':12,'exchanges':[{'name':'NSE','events':10}]}):
            data=main.exchanges()
        self.assertIsNone(data['items'][0]['latency_ms'])
        self.assertIsNone(data['items'][0]['heartbeat_age_s'])
        self.assertIsNone(data['items'][0]['reject_rate'])
        self.assertEqual(data['items'][0]['status'],'Events observed')

    def test_journal_exchange_rejection_rates_use_each_venue_denominator(self):
        from app.journal_snapshot import journal_exchanges
        from collections import Counter
        sample={'exchange_counts':Counter({'NSE':100,'BSE':2}),'items':[{'exchange':'NSE','status':'REJECTED'},{'exchange':'NSE','status':'OPEN'},{'exchange':'BSE','status':'OPEN'}],'to':'2026-09-08T00:00:00Z','source':'journal snapshot','rejected':[{}],'count':3}
        with patch('app.journal_snapshot.load_journal',return_value=sample):
            data=journal_exchanges('fixture')
        self.assertEqual([r['reject_rate'] for r in data['items']],[50,0])


class CorsOnErrorTests(unittest.TestCase):
    def test_a_synthesised_503_still_carries_cors_headers(self):
        # A dependency outage must reach the browser as a 503, not as a CORS error.
        import os
        origin = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")[0].strip()
        with patch.object(main, "DEMO_MODE", False), patch.object(main, "list_incidents", side_effect=RuntimeError("postgres down")):
            client = TestClient(main.app, raise_server_exceptions=False)
            res = client.get("/api/incidents", headers={"Origin": origin})
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.headers.get("access-control-allow-origin"), origin)
        self.assertNotIn("postgres down", res.text)
        self.assertEqual(res.headers.get("content-security-policy"), "default-src 'none'; frame-ancestors 'none'")
