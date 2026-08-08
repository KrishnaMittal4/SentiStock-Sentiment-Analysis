"""
Two-tiered Caching Layer for SentiStock AI backend.
Combines an ultra-fast in-memory TTL cache (level 1) with persistent database caching (level 2).

Lookup order:
1. Memory cache check (0ms response, zero DB overhead)
2. Database cache check (Fallback if memory misses)
3. Fetch fresh data from external upstream source
"""

from __future__ import annotations

import time
from typing import Any, Dict, Optional, Tuple
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_cached as db_get_cached, set_cached as db_set_cached
from .logging_config import logger

settings = get_settings()

# In-Memory Cache Store: key -> (payload_object, timestamp)
_MEM_CACHE: Dict[str, Tuple[Any, float]] = {}

# Metrics for cache performance monitoring
_CACHE_STATS = {
    "memory_hits": 0,
    "db_hits": 0,
    "misses": 0,
}


def _prune_memory_cache_if_needed() -> None:
    """Evict oldest entries if memory cache size exceeds threshold."""
    if len(_MEM_CACHE) > settings.memory_cache_max_size:
        # Evict oldest 20% of entries based on timestamp
        sorted_keys = sorted(_MEM_CACHE.keys(), key=lambda k: _MEM_CACHE[k][1])
        evict_count = max(1, len(sorted_keys) // 5)
        for k in sorted_keys[:evict_count]:
            _MEM_CACHE.pop(k, None)


def get_cached_item(db: Session, key: str, max_age_seconds: int) -> Optional[Any]:
    """
    Retrieves item from two-tiered cache.
    First checks L1 in-memory cache, then L2 database cache.
    """
    now = time.time()

    # 1. Level-1 In-Memory Cache Check
    if key in _MEM_CACHE:
        val, timestamp = _MEM_CACHE[key]
        if (now - timestamp) <= max_age_seconds:
            _CACHE_STATS["memory_hits"] += 1
            return val
        else:
            # Expired in memory
            _MEM_CACHE.pop(key, None)

    # 2. Level-2 Database Cache Check
    db_val = db_get_cached(db, key, max_age_seconds)
    if db_val is not None:
        _CACHE_STATS["db_hits"] += 1
        # Warm L1 cache
        _prune_memory_cache_if_needed()
        _MEM_CACHE[key] = (db_val, now)
        return db_val

    _CACHE_STATS["misses"] += 1
    return None


def set_cached_item(db: Session, key: str, value: Any) -> None:
    """
    Upserts item in both Level-1 in-memory cache and Level-2 database cache.
    """
    now = time.time()
    _prune_memory_cache_if_needed()
    _MEM_CACHE[key] = (value, now)
    db_set_cached(db, key, value)


def invalidate_cache_key(key: str, db: Optional[Session] = None) -> None:
    """Removes a key from memory and database cache."""
    _MEM_CACHE.pop(key, None)
    if db is not None:
        from .database import CacheEntry
        entry = db.get(CacheEntry, key)
        if entry:
            db.delete(entry)
            db.commit()


def get_cache_stats() -> Dict[str, Any]:
    """Returns telemetry on memory/DB cache hits and misses."""
    total_requests = _CACHE_STATS["memory_hits"] + _CACHE_STATS["db_hits"] + _CACHE_STATS["misses"]
    hit_rate = (
        round((_CACHE_STATS["memory_hits"] + _CACHE_STATS["db_hits"]) / total_requests * 100, 2)
        if total_requests > 0 else 0.0
    )
    return {
        "memory_entries": len(_MEM_CACHE),
        "memory_hits": _CACHE_STATS["memory_hits"],
        "db_hits": _CACHE_STATS["db_hits"],
        "misses": _CACHE_STATS["misses"],
        "total_requests": total_requests,
        "hit_rate_pct": hit_rate,
    }
