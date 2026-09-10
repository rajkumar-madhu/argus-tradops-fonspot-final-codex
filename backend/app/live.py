from __future__ import annotations
import asyncio
import json
import re
from datetime import datetime, timezone
from typing import AsyncIterator
from app.config import settings
from redis.exceptions import TimeoutError as RedisTimeoutError
from app.event_bus import BLOCK_MS, STREAMS, decode_message, get_redis


async def event_stream(kind: str, interval: float = 2.0, last_event_id: str | None = None) -> AsyncIterator[str]:
    """Stream Redis Stream events to browsers over SSE.

    Elasticsearch is polled only by the collector service. API replicas consume the
    shared Redis stream, so connected browsers do not multiply Elasticsearch load.
    """
    if kind not in STREAMS:
        yield f"event: error\ndata: {json.dumps({'message':'unknown stream'})}\n\n"
        return
    r = get_redis()
    stream = STREAMS[kind]
    last_id = last_event_id if last_event_id and re.fullmatch(r"[0-9]+-[0-9]+", last_event_id) else None
    heartbeat = max(5.0, settings.sse_heartbeat_seconds)
    last_emit = asyncio.get_running_loop().time()
    while True:
        try:
            if last_id is None:
                newest = await asyncio.to_thread(r.xrevrange, stream, count=1)
                last_id = newest[0][0] if newest else "0-0"
            # redis-py is synchronous; move blocking XREAD off the async event loop.
            block_ms = max(1000, min(int(heartbeat * 1000), BLOCK_MS))
            try:
                rows = await asyncio.to_thread(r.xread, {stream: last_id}, 100, block_ms)
            except RedisTimeoutError:
                # An idle stream is normal, not a failure. Fall through to the
                # heartbeat instead of pushing `event: error` at the browser.
                rows = None
            if rows:
                for _, messages in rows:
                    for msg_id, fields in messages:
                        last_id = msg_id
                        env = decode_message(fields)
                        payload = env.get("payload") or {}
                        payload["stream"] = kind
                        payload["stream_id"] = msg_id
                        payload["streamed_at"] = datetime.now(timezone.utc).isoformat()
                        yield f"id: {msg_id}\nevent: {kind}\ndata: {json.dumps(payload, default=str)}\n\n"
                        last_emit = asyncio.get_running_loop().time()
            elif asyncio.get_running_loop().time() - last_emit >= heartbeat:
                yield ": heartbeat\n\n"
                last_emit = asyncio.get_running_loop().time()
            await asyncio.sleep(max(0.05, min(interval, 1.0)))
        except asyncio.CancelledError:
            return
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'message':'Event stream temporarily unavailable'})}\n\n"
            await asyncio.sleep(2)
