"""Real RS256 verification and HTTP contracts; signing keys exist only in RAM."""
from dataclasses import replace
from types import SimpleNamespace
import time
import unittest
from unittest.mock import patch

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth
from app.main import app


class LoginContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def setUp(self):
        settings = replace(auth.settings, auth_disabled=False, keycloak_url='https://fixture.invalid', keycloak_realm='test', keycloak_client_id='tradeops-web', keycloak_verify_audience=True)
        self.settings_patch = patch.object(auth, 'settings', settings)
        self.settings_patch.start()
        self.addCleanup(self.settings_patch.stop)
        self.jwks_patch = patch.object(auth, 'jwks_client', return_value=SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=self.key.public_key())))
        self.jwks_patch.start()
        self.addCleanup(self.jwks_patch.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def token(self, roles=('trading_ops',), **claims):
        now = int(time.time())
        payload = dict(sub='fixture-user', iss='https://fixture.invalid/realms/test', aud='tradeops-web', azp='tradeops-web', exp=now + 300, iat=now, realm_access={'roles': list(roles)})
        payload.update(claims)
        return jwt.encode(payload, self.key, algorithm='RS256')

    def get(self, route, token):
        return self.client.get(route, headers={'Authorization': f'Bearer {token}'})

    def test_missing_session_is_401(self):
        for route in ['/api/auth/me', '/api/overview', '/api/orders']:
            self.assertEqual(self.client.get(route).status_code, 401)

    def test_valid_signed_token_returns_normalized_user(self):
        result = self.get('/api/auth/me', self.token())
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['sub'], 'fixture-user')
        self.assertEqual(result.json()['roles'], ['trading_ops'])
        self.assertIn('dashboard:read', result.json()['permissions'])
        self.assertNotIn('access_token', result.json())

    def test_cookie_restores_the_same_session(self):
        self.client.cookies.set('tradeops_token', self.token())
        result = self.client.get('/api/auth/me')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['roles'], ['trading_ops'])

    def test_expiry_issuer_audience_and_signature_fail_closed(self):
        invalid = [self.token(exp=int(time.time()) - 10), self.token(iss='https://wrong.invalid'), self.token(aud='other-client'), 'malformed-fixture']
        for token in invalid:
            response = self.get('/api/auth/me', token)
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()['detail'], 'Invalid or expired token')
            self.assertNotIn(token, response.text)

    def test_valid_user_without_role_is_authenticated_but_dashboard_is_forbidden(self):
        token = self.token(roles=())
        self.assertEqual(self.get('/api/auth/me', token).status_code, 200)
        response = self.get('/api/overview', token)
        self.assertEqual(response.status_code, 403)
        detail = response.json()['detail']
        self.assertEqual(detail['permission'], 'dashboard:read')
        self.assertIn('trading_ops', detail['granted_by'])

    def test_risk_user_cannot_read_order_records(self):
        response = self.get('/api/orders', self.token(roles=('risk',)))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['detail']['permission'], 'orders:read')

    def test_cleared_session_is_no_longer_authenticated(self):
        self.client.cookies.set('tradeops_token', self.token())
        self.assertEqual(self.client.get('/api/auth/me').status_code, 200)
        self.client.cookies.clear()
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)


if __name__ == '__main__':
    unittest.main()
