import tempfile
import unittest
from pathlib import Path

from app.config import Settings, multi_tenant_errors, production_errors

ROOT = Path(__file__).resolve().parents[2]


def _prod(**overrides):
    values = dict(
        environment="production",
        demo_mode=False,
        auth_disabled=False,
        es_verify_certs=True,
        keycloak_url="https://identity.example.test",
        database_url="postgresql+psycopg://app:strong-password@db/app",
    )
    values.update(overrides)
    return Settings(**values)


class ProductionConfigTests(unittest.TestCase):
    def test_development_is_explicitly_allowed(self):
        self.assertEqual(production_errors(Settings(environment="development")), [])

    def test_production_rejects_demo_auth_bypass_and_insecure_tls(self):
        errors = production_errors(Settings(environment="production", demo_mode=True, auth_disabled=True, es_verify_certs=False))
        self.assertTrue(any("demo" in e.lower() for e in errors))
        self.assertTrue(any("AUTH_DISABLED" in e for e in errors))
        self.assertTrue(any("TLS" in e for e in errors))

    def test_signup_is_off_unless_explicitly_enabled(self):
        self.assertFalse(Settings().allow_signup)
        self.assertTrue(Settings(allow_signup=True).allow_signup)

    def test_hardened_settings_pass(self):
        self.assertEqual(production_errors(_prod()), [])

    def test_production_multi_tenant_requires_mounted_secrets_dir(self):
        missing = _prod(multi_tenant=True, tenant_secrets_dir="/no/such/tradeops-tenant-secrets")
        self.assertTrue(any("TENANT_SECRETS" in e for e in multi_tenant_errors(missing)))
        with tempfile.TemporaryDirectory() as secrets:
            ok = _prod(multi_tenant=True, tenant_secrets_dir=secrets, tenant_journal_dir="")
            self.assertEqual(production_errors(ok) + multi_tenant_errors(ok), [])

    def test_production_multi_tenant_requires_journal_dir_when_set(self):
        with tempfile.TemporaryDirectory() as secrets:
            missing = _prod(
                multi_tenant=True,
                tenant_secrets_dir=secrets,
                tenant_journal_dir="/no/such/tradeops-tenant-journals",
            )
            self.assertTrue(any("TENANT_JOURNAL" in e for e in multi_tenant_errors(missing)))
            with tempfile.TemporaryDirectory() as journals:
                ok = _prod(multi_tenant=True, tenant_secrets_dir=secrets, tenant_journal_dir=journals)
                self.assertEqual(multi_tenant_errors(ok), [])

    def test_production_manifests_wire_tenant_secret_and_journal_mounts(self):
        cm = (ROOT / "k8s" / "configmap.yaml").read_text()
        api = (ROOT / "k8s" / "backend.yaml").read_text()
        workers = (ROOT / "k8s" / "workers.yaml").read_text()
        self.assertIn('TRADEOPS_MULTI_TENANT: "false"', cm)
        self.assertIn("TRADEOPS_TENANT_SECRETS_DIR: \"/etc/tradeops/tenant-secrets\"", cm)
        self.assertIn("TRADEOPS_TENANT_JOURNAL_DIR: \"/data/tenant-journals\"", cm)
        self.assertIn("secretName: tradeops-tenant-secrets", api)
        self.assertIn("/etc/tradeops/tenant-secrets", api)
        self.assertIn("/data/tenant-journals", api)
        self.assertNotIn("tradeops-tenant-secrets", workers)


if __name__ == "__main__":
    unittest.main()
