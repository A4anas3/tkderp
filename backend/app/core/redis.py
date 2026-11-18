import json
import logging
from typing import Optional, Any
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger("app.redis")

_redis_client: Optional[aioredis.Redis] = None

def get_redis_client() -> Optional[aioredis.Redis]:
    global _redis_client
    if not settings.REDIS_ENABLED:
        return None
    if _redis_client is None:
        try:
            _redis_client = aioredis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0
            )
        except Exception as e:
            logger.warning(f"Failed to initialize Redis client: {e}")
            _redis_client = None
    return _redis_client

async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.close()
        except Exception:
            pass
        _redis_client = None

async def get_cache(key: str) -> Optional[Any]:
    client = get_redis_client()
    if not client:
        return None
    try:
        val = await client.get(key)
        if val is not None:
            return json.loads(val)
        return None
    except Exception as e:
        logger.debug(f"Redis get_cache error for key '{key}': {e}")
        return None

async def set_cache(key: str, value: Any, ttl: int = settings.CACHE_DEFAULT_TTL) -> bool:
    client = get_redis_client()
    if not client:
        return False
    try:
        serialized = json.dumps(value, default=str)
        await client.set(key, serialized, ex=ttl)
        return True
    except Exception as e:
        logger.debug(f"Redis set_cache error for key '{key}': {e}")
        return False

async def delete_cache(key: str) -> bool:
    client = get_redis_client()
    if not client:
        return False
    try:
        await client.delete(key)
        return True
    except Exception as e:
        logger.debug(f"Redis delete_cache error for key '{key}': {e}")
        return False

async def delete_cache_pattern(pattern: str) -> int:
    client = get_redis_client()
    if not client:
        return 0
    try:
        keys = []
        async for k in client.scan_iter(match=pattern):
            keys.append(k)
        if keys:
            return await client.delete(*keys)
        return 0
    except Exception as e:
        logger.debug(f"Redis delete_cache_pattern error for pattern '{pattern}': {e}")
        return 0
