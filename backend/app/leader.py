from __future__ import annotations
import secrets
from dataclasses import dataclass
from app.event_bus import get_redis

_RENEW = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('expire', KEYS[1], ARGV[2])
else
  return 0
end
"""
_RELEASE = """
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
"""

@dataclass
class RedisLeaderLease:
    key: str
    ttl_seconds: int
    token: str = ""

    def __post_init__(self) -> None:
        if not self.token:
            self.token = secrets.token_urlsafe(24)

    def acquire(self) -> bool:
        return bool(get_redis().set(self.key, self.token, nx=True, ex=self.ttl_seconds))

    def renew(self) -> bool:
        return bool(get_redis().eval(_RENEW, 1, self.key, self.token, self.ttl_seconds))

    def release(self) -> bool:
        return bool(get_redis().eval(_RELEASE, 1, self.key, self.token))
