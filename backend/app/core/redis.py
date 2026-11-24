import asyncio
import json
import logging
from typing import Optional, Any, Dict
import redis.asyncio as aioredis
from app.core.config import settings

logger = logging.getLogger("app.redis")

_redis_clients: Dict[int, aioredis.Redis] = {}


def _current_loop_key() -> int:
    try:
        return id(asyncio.get_running_loop())
    except RuntimeError:
        return 0


def get_redis_client() -> Optional[aioredis.Redis]:
    if not settings.REDIS_ENABLED:
        return None
    loop_key = _current_loop_key()
    client = _redis_clients.get(loop_key)
    if client is None:
        try:
            client = aioredis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
            )
            _redis_clients[loop_key] = client
        except Exception as e:
            logger.warning(f"Failed to initialize Redis client: {e}")
            return None
    return client


async def close_redis() -> None:
    clients = list(_redis_clients.values())
    _redis_clients.clear()
    for client in clients:
        try:
            if hasattr(client, "aclose"):
                await client.aclose()
            else:
                await client.close()
        except Exception:
            pass


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
        deleted = 0
        batch = []
        async for k in client.scan_iter(match=pattern, count=500):
            batch.append(k)
            if len(batch) >= 500:
                deleted += await client.delete(*batch)
                batch.clear()
        if batch:
            deleted += await client.delete(*batch)
        return deleted
    except Exception as e:
        logger.debug(f"Redis delete_cache_pattern error for pattern '{pattern}': {e}")
        return 0
