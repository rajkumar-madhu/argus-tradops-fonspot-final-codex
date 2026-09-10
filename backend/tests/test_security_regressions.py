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


class RejectionReasonMasking(unittest.TestCase):
    def test_client_identity_and_money_are_masked(self):
        from app.elastic.normalizer import mask_reason
        cases = {
            "ORA: clientid SPS123-KFS is not active : Suspended": "ORA: clientid ***-KFS is not active : Suspended",
            "ORA:Product MTF not enabled for Account K123-VRD": "ORA:Product MTF not enabled for Account ***-VRD",
            "NON-COMPLIANT CLIENT CODE : G1234": "NON-COMPLIANT CLIENT CODE : ***",
            "RED:Block Type:NonSqoff Reason:Continuous Debit[ 1234567-ISB M ]": "RED:Block Type:NonSqoff Reason:Continuous Debit[ ***-ISB M ]",
            "RED:RULE:{Check Holdings Including BTST}Eligible Sell:12 for C-A1-HSB [RISK-HSB]": "RED:RULE:{Check Holdings Including BTST}Eligible Sell:*** for C-***-HSB [RISK-HSB]",
            "RED:RULE:{Check Peak Margin}Available:INR -12345.67 Peak Margin:INR 999.00 for C-Z9-CSB [RISK-CSB]": "RED:RULE:{Check Peak Margin}Available:INR *** Peak Margin:INR *** for C-***-CSB [RISK-CSB]",
        }
        for raw, expected in cases.items():
            self.assertEqual(mask_reason(raw), expected)

    def test_market_figures_that_explain_the_rejection_stay_readable(self):
        from app.elastic.normalizer import mask_reason
        raw = "RED:RULE:{Check circuit limit including square off order}Current:INR 261.00 LowerCircuit:INR 261.65 UpperCircuit:INR 319.75:NSE.ITC-EQ for C-S476-KBC [PMS-KBC]"
        self.assertEqual(mask_reason(raw), raw.replace("C-S476-KBC", "C-***-KBC"))
        self.assertEqual(mask_reason(None), "")


class OrderReasonMasking(unittest.TestCase):
    def test_every_normalized_order_carries_a_masked_reason(self):
        # normalize_order feeds lists, the lifecycle route, RCA and the event bus.
        from app.elastic.normalizer import normalize_order
        doc = {"NorenOrdNum": "1", "OrdStatus": 56,
               "RejReason": "RED:Margin Shortfall:INR 22.18 Available:INR 114280.07 for C-R1289-PSB [PSBDIRECT-PSB]"}
        order = normalize_order(doc)
        self.assertNotIn("114280.07", order["reason"])
        self.assertNotIn("R1289", order["reason"])
        self.assertEqual(order["code"], "RED")
        self.assertEqual(order["rejection_category"], "RMS / Margin")


class RedisStatusRegression(unittest.TestCase):
    def test_redis_status_never_returns_exception_text(self):
        from app import event_bus
        class Broken:
            def ping(self): raise RuntimeError('redis://:private-password@private-host:6379 refused')
        with patch.object(event_bus, 'get_redis', return_value=Broken()):
            result = event_bus.redis_status()
        self.assertFalse(result['connected'])
        self.assertNotIn('private', str(result))
