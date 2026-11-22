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
    Lightweight rate limiter for public endpoints.
    Uses Redis when available, falling back to an in-memory sliding window.
    """
    def __init__(self, times: int = 60, seconds: int = 60, prefix: str = "ratelimit"):
        self.times = times
        self.seconds = seconds
        self.prefix = prefix

    async def __call__(self, request: Request) -> None:
        client_ip = get_client_ip(request)
        key = f"{self.prefix}:{client_ip}"
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
                    retry_after = str(max(ttl, 1))
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="Rate limit exceeded. Please wait a moment before trying again.",
                        headers={"Retry-After": retry_after}
                    )
                return
            except HTTPException:
                raise
            except Exception as e:
                logger.debug(f"Redis rate limiting failed, falling back to in-memory: {e}")

        # 2. In-memory sliding window fallback
        cutoff = now - self.seconds
        timestamps = _in_memory_requests.get(key, [])
        # Filter timestamps older than the sliding window
        valid_timestamps = [ts for ts in timestamps if ts > cutoff]

        if len(valid_timestamps) >= self.times:
            retry_after = str(max(int(self.seconds - (now - valid_timestamps[0])) + 1, 1))
            _in_memory_requests[key] = valid_timestamps
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Rate limit exceeded. Please wait a moment before trying again.",
                headers={"Retry-After": retry_after}
            )

        valid_timestamps.append(now)
        _in_memory_requests[key] = valid_timestamps
