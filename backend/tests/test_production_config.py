import unittest
from app.config import Settings, production_errors

class ProductionConfigTests(unittest.TestCase):
    def test_development_is_explicitly_allowed(self):
        self.assertEqual(production_errors(Settings(environment='development')), [])

    def test_production_rejects_demo_auth_bypass_and_insecure_tls(self):
        errors = production_errors(Settings(environment='production', demo_mode=True, auth_disabled=True, es_verify_certs=False))
        self.assertTrue(any('demo' in e.lower() for e in errors))
        self.assertTrue(any('AUTH_DISABLED' in e for e in errors))
        self.assertTrue(any('TLS' in e for e in errors))

    def test_signup_is_off_unless_explicitly_enabled(self):
        self.assertFalse(Settings().allow_signup)
        self.assertTrue(Settings(allow_signup=True).allow_signup)

    def test_hardened_settings_pass(self):
        config = Settings(environment='production', demo_mode=False, auth_disabled=False,
                          es_verify_certs=True, keycloak_url='https://identity.example.test',
                          database_url='postgresql+psycopg://app:strong-password@db/app')
        self.assertEqual(production_errors(config), [])
