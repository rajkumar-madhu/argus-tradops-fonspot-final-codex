import unittest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from app.config import parse_cors_origins


class CorsOriginsTests(unittest.TestCase):
    def test_json_uat_and_comma_configuration_are_equivalent(self):
        origin = 'https://tradeops-uat.finspot.in'
        self.assertEqual(parse_cors_origins('["' + origin + '"]'), [origin])
        self.assertEqual(parse_cors_origins(origin + ', http://localhost:3000'), [origin, 'http://localhost:3000'])

    def test_empty_and_duplicate_entries(self):
        self.assertEqual(parse_cors_origins('https://ui.test/, https://ui.test, '), ['https://ui.test'])
        self.assertEqual(parse_cors_origins('[]'), [])

    def test_malformed_and_wildcard_origins_fail_closed(self):
        for value in ['[broken', '[null]', '*', 'https://ui.test/path', 'https://user:password@ui.test']:
            with self.assertRaises(ValueError):
                parse_cors_origins(value)

    def test_configured_origin_receives_cors_headers_but_other_origin_does_not(self):
        app = FastAPI()
        app.add_middleware(CORSMiddleware, allow_origins=parse_cors_origins('["https://ui.test"]'), allow_credentials=True, allow_headers=['Authorization'], allow_methods=['GET'])
        @app.get('/api/auth/config')
        def config():
            return {'auth_disabled': False}
        with TestClient(app) as client:
            for origin in ['https://ui.test', 'https://other.test']:
                r = client.get('/api/auth/config', headers={'Origin': origin})
                self.assertEqual(r.headers.get('access-control-allow-origin'), origin if origin == 'https://ui.test' else None)


if __name__ == '__main__':
    unittest.main()
