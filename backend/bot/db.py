"""
Daladan Bot — Async Database Layer
====================================
Uses asyncpg for non-blocking Postgres access.
Manages a connection pool for the bot's lifetime.
"""

import asyncpg

from .config import config

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    """Create (or return existing) connection pool."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=config.db_dsn,
            min_size=1,
            max_size=5,
        )
    return _pool


async def close_pool() -> None:
    """Gracefully close the connection pool."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def get_pool() -> asyncpg.Pool:
    """Convenience accessor — initializes on first call."""
    if _pool is None:
        return await init_pool()
    return _pool


# ──────────────────────────────────────────────────────────────
# Queries
# ──────────────────────────────────────────────────────────────

async def find_user_by_telegram_id(telegram_id: int) -> asyncpg.Record | None:
    """Return the users row matching `telegram_id`, or None."""
    pool = await get_pool()
    return await pool.fetchrow(
        "SELECT id, telegram_id, is_bot_started, full_name "
        "FROM public.users WHERE telegram_id = $1",
        telegram_id,
    )


async def mark_bot_started(telegram_id: int) -> None:
    """Set is_bot_started = TRUE for the given telegram_id."""
    pool = await get_pool()
    await pool.execute(
        "UPDATE public.users SET is_bot_started = TRUE WHERE telegram_id = $1",
        telegram_id,
    )
