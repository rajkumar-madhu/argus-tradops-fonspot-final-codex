import unittest
from app.readiness import evaluate_checks
class ReadinessTests(unittest.TestCase):
    def test_all_dependencies_required(self):
        self.assertEqual(evaluate_checks({'a': lambda: True, 'b': lambda: False})['status'], 'unavailable')
        self.assertEqual(evaluate_checks({'a': lambda: True})['status'], 'ready')
    def test_errors_do_not_disclose_connection_secrets(self):
        def broken(): raise RuntimeError('postgres://secret:password@private')
        result = evaluate_checks({'database_schema': broken})
        self.assertEqual(result['dependencies']['database_schema'], 'unavailable')
        self.assertNotIn('secret', str(result))
