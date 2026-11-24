import time
from typing import Optional, Dict, List
import logging
from fastapi import Request, HTTPException, status
from app.core.redis import get_redis_client

logger = logging.getLogger("app.rate_limit")

# In-memory fallback tracking: {key: [timestamp1, timestamp2, ...]}
_in_memory_requests: Dict[str, List[float]] = {}

def get_client_ip(request: Request) -> str:
    """Extract client IP from headers or connection."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # First IP in X-Forwarded-For is the original client IP
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return "127.0.0.1"

def reset_rate_limits() -> None:
    """Clear in-memory rate limiting tracking (useful for tests)."""
    global _in_memory_requests
    _in_memory_requests.clear()

async def reset_rate_limits_async(prefix: Optional[str] = None) -> None:
    """Clear in-memory and Redis rate limiting tracking."""
    global _in_memory_requests
    _in_memory_requests.clear()
    redis = get_redis_client()
    if redis:
        try:
            pattern = f"{prefix}:*" if prefix else "*ratelimit*"
            keys = await redis.keys(pattern)
            if keys:
                await redis.delete(*keys)
        except Exception as e:
            logger.debug(f"Failed to clear redis keys in reset_rate_limits_async: {e}")

class RateLimiter:
    """
    Lightweight rate limiter for public and auth endpoints.
    Uses Redis when available, falling back to an in-memory sliding window.
    """
    def __init__(
        self,
        times: int = 60,
        seconds: int = 60,
        prefix: str = "ratelimit",
        detail: str = "Rate limit exceeded. Please wait a moment before trying again.",
    ):
        self.times = times
        self.seconds = seconds
        self.prefix = prefix
        self.detail = detail

    def _key(self, identifier: str) -> str:
        return f"{self.prefix}:{identifier}"

    def _too_many_requests(self, retry_after: str) -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=self.detail,
            headers={"Retry-After": retry_after},
        )

    def _prune_in_memory(self, key: str, now: float) -> List[float]:
        cutoff = now - self.seconds
        timestamps = _in_memory_requests.get(key, [])
        valid_timestamps = [ts for ts in timestamps if ts > cutoff]
        if valid_timestamps:
            _in_memory_requests[key] = valid_timestamps
        else:
            _in_memory_requests.pop(key, None)
        return valid_timestamps

    async def check(self, identifier: str) -> None:
        """Check whether identifier has reached the limit without incrementing."""
        key = self._key(identifier)
        redis = get_redis_client()
        if redis:
            try:
                val = await redis.get(key)
                if val is not None and int(val) >= self.times:
                    ttl = await redis.ttl(key)
                    raise self._too_many_requests(str(max(ttl, 1)))
                return
            except HTTPException:
                raise
            except Exception as e:
                logger.debug(f"Redis rate limit check failed, falling back to in-memory: {e}")

        now = time.time()
        valid_timestamps = self._prune_in_memory(key, now)
        if len(valid_timestamps) >= self.times:
            retry_after = str(max(int(self.seconds - (now - valid_timestamps[0])) + 1, 1))
            raise self._too_many_requests(retry_after)

    async def record(self, identifier: str) -> int:
        """Record one attempt for identifier and return the current window count."""
        key = self._key(identifier)
        redis = get_redis_client()
        if redis:
            try:
                current = await redis.incr(key)
                if current == 1:
                    await redis.expire(key, self.seconds)
                return int(current)
            except Exception as e:
                logger.debug(f"Redis rate limit record failed, falling back to in-memory: {e}")

        now = time.time()
        valid_timestamps = self._prune_in_memory(key, now)
        valid_timestamps.append(now)
        _in_memory_requests[key] = valid_timestamps
        return len(valid_timestamps)

    async def __call__(self, request: Request) -> None:
        client_ip = get_client_ip(request)
        key = self._key(client_ip)
        now = time.time()

        # 1. Attempt Redis rate limiting
        redis = get_redis_client()
        if redis:
            try:
                current = await redis.incr(key)
                if current == 1:
                    await redis.expire(key, self.seconds)
                if current > self.times:
                    ttl = await redis.ttl(key)
                    raise self._too_many_requests(str(max(ttl, 1)))
                return
            except HTTPException:
                raise
            except Exception as e:
                logger.debug(f"Redis rate limiting failed, falling back to in-memory: {e}")

        # 2. In-memory sliding window fallback
        valid_timestamps = self._prune_in_memory(key, now)
        if len(valid_timestamps) >= self.times:
            retry_after = str(max(int(self.seconds - (now - valid_timestamps[0])) + 1, 1))
            raise self._too_many_requests(retry_after)

        valid_timestamps.append(now)
        _in_memory_requests[key] = valid_timestamps
