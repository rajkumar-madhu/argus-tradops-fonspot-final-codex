import unittest
from unittest.mock import patch
from dataclasses import replace
from fastapi import HTTPException
from app import auth
from app.elastic import service

class SecurityRegressions(unittest.TestCase):
    def test_token_failure_does_not_return_upstream_details(self):
        class Request:
            cookies={'tradeops_token':'invalid'}
            query_params={}
        with patch.object(auth,'settings',replace(auth.settings,auth_disabled=False)), patch.object(auth,'jwks_client',side_effect=RuntimeError('private-credential-marker')):
            with self.assertRaises(HTTPException) as error: auth.current_user(Request(),None)
        self.assertNotIn('private-credential-marker',error.exception.detail)

    def test_es_health_does_not_return_connection_error(self):
        class ES:
            def info(self): raise RuntimeError('private-credential-marker')
        with patch.object(service,'get_es',return_value=ES()): result=service.elk_status()
        self.assertNotIn('private-credential-marker',str(result))

    def test_postgres_health_requires_a_successful_probe(self):
        from app import main
        class Engine:
            def connect(self): raise RuntimeError('private-connection-details')
        with patch.object(main,'_use_journal_data',return_value=False), patch.object(main,'DEMO_MODE',False), patch.object(main,'elk_status',return_value={'connected':False}), patch.object(main,'redis_status',return_value={'connected':False}), patch('app.db.engine',Engine()):
            result=main.infra()
        self.assertEqual(result['postgres']['status'],'Unavailable')
        self.assertNotIn('private-connection-details',str(result))

    def test_image_does_not_log_query_strings(self):
        # SSE authenticates with ?access_token=<JWT>; uvicorn's access log prints
        # the raw query string, so leaving it on writes bearer tokens to pod logs.
        from pathlib import Path
        cmd=[line for line in (Path(__file__).resolve().parents[1]/'Dockerfile').read_text().splitlines() if line.startswith('CMD')]
        self.assertEqual(len(cmd),1)
        self.assertIn('--no-access-log',cmd[0])
