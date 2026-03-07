"""
Daladan Telegram Bot — Fully Self-Contained Entry Point
=========================================================
Run with:
    cd backend
    python -m bot.main

Prerequisites:
    pip install aiogram asyncpg python-dotenv
"""

import asyncio
import logging
import os
import sys

import asyncpg
from aiogram import Bot, Dispatcher, Router
from aiogram.filters import CommandStart
from aiogram.types import Message
from dotenv import load_dotenv

# ──────────────────────────────────────────────────────────────
# 1. Configuration
# ──────────────────────────────────────────────────────────────

load_dotenv()  # reads backend/.env

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")

if not BOT_TOKEN:
    sys.exit("❌  TELEGRAM_BOT_TOKEN is not set. Check your .env file.")
if not DATABASE_URL:
    sys.exit("❌  DATABASE_URL is not set. Check your .env file.")

# ──────────────────────────────────────────────────────────────
# 2. Logging
# ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger("daladan_bot")

# ──────────────────────────────────────────────────────────────
# 3. Database helpers  (asyncpg + connection pool)
# ──────────────────────────────────────────────────────────────

pool: asyncpg.Pool | None = None


async def create_pool() -> asyncpg.Pool:
    """Create the asyncpg connection pool with retry logic."""
    global pool
    for attempt in range(1, 4):               # 3 attempts
        try:
            pool = await asyncpg.create_pool(
                dsn=DATABASE_URL,
                min_size=1,
                max_size=5,
                command_timeout=10,            # per-query timeout
            )
            logger.info("✅  Database pool created (attempt %d).", attempt)
            return pool
        except Exception as exc:
            logger.warning("⚠️  DB connection attempt %d failed: %s", attempt, exc)
            if attempt < 3:
                await asyncio.sleep(2)
            else:
                raise


async def close_pool() -> None:
    """Gracefully shut down the pool."""
    global pool
    if pool is not None:
        await pool.close()
        pool = None
        logger.info("Database pool closed.")


async def find_user_by_telegram_id(telegram_id: int) -> asyncpg.Record | None:
    """Look up a user row by their Telegram ID.

    NOTE: The actual table is public.users (not public.profiles).
    """
    assert pool is not None
    return await pool.fetchrow(
        "SELECT id, telegram_id, is_bot_started, full_name "
        "FROM public.users "
        "WHERE telegram_id = $1",
        telegram_id,
    )


async def mark_bot_started(telegram_id: int) -> None:
    """Set is_bot_started = TRUE for the given Telegram ID."""
    assert pool is not None
    await pool.execute(
        "UPDATE public.users "
        "SET is_bot_started = TRUE "
        "WHERE telegram_id = $1",
        telegram_id,
    )


# ──────────────────────────────────────────────────────────────
# 4. Bot handler(s)
# ──────────────────────────────────────────────────────────────

router = Router(name="core")


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    """/start handler — link check + welcome."""
    telegram_id = message.from_user.id
    logger.info("/start from telegram_id=%s", telegram_id)

    # --- Database lookup --------------------------------------------------
    try:
        user = await find_user_by_telegram_id(telegram_id)
    except Exception:
        logger.exception("DB error looking up telegram_id=%s", telegram_id)
        await message.answer(
            "⚠️ Sorry, we're having trouble reaching the database right now. "
            "Please try again in a moment."
        )
        return

    # --- User NOT found → ask them to link on the website -----------------
    if user is None:
        await message.answer(
            "👋 Welcome!\n\n"
            "We don't recognize this account yet. "
            "Please log in to the <b>Daladan</b> website first to link "
            "your Telegram.\n\n"
            "Once linked, come back and press /start again.",
            parse_mode="HTML",
        )
        return

    # --- User found → flip the flag and welcome them ----------------------
    try:
        await mark_bot_started(telegram_id)
    except Exception:
        logger.exception("DB error updating is_bot_started for telegram_id=%s", telegram_id)
        # Non-fatal: still greet the user even if the flag update fails

    name = user["full_name"] or "there"
    await message.answer(
        f"✅ Welcome to <b>Daladan</b>, {name}!\n\n"
        "Your account is successfully linked. "
        "You will receive your logistics and harvest updates here.",
        parse_mode="HTML",
    )


# ──────────────────────────────────────────────────────────────
# 5. Lifecycle & entry point
# ──────────────────────────────────────────────────────────────

async def on_startup() -> None:
    await create_pool()


async def on_shutdown() -> None:
    await close_pool()


async def main() -> None:
    bot = Bot(token=BOT_TOKEN)
    dp = Dispatcher()

    dp.include_router(router)
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    logger.info("🚀  Starting Daladan bot (long-polling)…")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
