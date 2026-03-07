"""
Daladan Bot — Command Handlers
================================
All bot command/message handlers live here.
"""

import logging

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import Message

from . import db

logger = logging.getLogger(__name__)
router = Router(name="core")


@router.message(CommandStart())
async def cmd_start(message: Message) -> None:
    """
    /start handler.

    • If the user's telegram_id is in public.users → mark is_bot_started = True
      and send a welcome message.
    • Otherwise → ask them to link their account on the website first.
    """
    telegram_id = message.from_user.id

    try:
        user = await db.find_user_by_telegram_id(telegram_id)
    except Exception:
        logger.exception("Database error while looking up telegram_id=%s", telegram_id)
        await message.answer(
            "⚠️ Sorry, we're having trouble reaching the database. "
            "Please try again in a moment."
        )
        return

    if user is None:
        await message.answer(
            "👋 Hello!\n\n"
            "Please log in to the <b>Daladan</b> website first and link your "
            "Telegram account. Then come back here and press /start again.",
            parse_mode="HTML",
        )
        return

    # Account found — flip the flag (idempotent)
    try:
        await db.mark_bot_started(telegram_id)
    except Exception:
        logger.exception("Database error while updating is_bot_started for telegram_id=%s", telegram_id)

    name = user["full_name"] or "there"
    await message.answer(
        f"✅ Welcome to <b>Daladan</b>, {name}!\n\n"
        "Your account is linked and you will receive logistics updates here.",
        parse_mode="HTML",
    )
