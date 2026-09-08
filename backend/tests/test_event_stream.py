import json
import unittest
from unittest.mock import patch
from app.live import event_stream

class FakeRedis:
    def __init__(self): self.read_ids = []
    def xrevrange(self, *args, **kwargs): return [('100-0', {})]
    def xread(self, streams, *args):
        self.read_ids.append(next(iter(streams.values())))
        if len(self.read_ids) == 1: return []
        return [('stream', [('101-0', {'json': json.dumps({'payload': {'order_id': 'A'}})})])]

class EventStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_idle_poll_keeps_concrete_cursor_and_emits_reconnect_id(self):
        redis = FakeRedis()
        with patch('app.live.get_redis', return_value=redis):
            stream = event_stream('orders', .05)
            event = await anext(stream)
            await stream.aclose()
        self.assertEqual(redis.read_ids, ['100-0', '100-0'])
        self.assertIn('id: 101-0', event)

    async def test_reconnect_resumes_from_last_event(self):
        redis = FakeRedis()
        with patch('app.live.get_redis', return_value=redis):
            stream = event_stream('orders', .05, last_event_id='99-0')
            await anext(stream)
            await stream.aclose()
        self.assertEqual(redis.read_ids[0], '99-0')
