"""
Daladan — Telegram Login Widget HMAC Verification
===================================================
Verifies data received from the official Telegram Login Widget.

Usage:
    from utils.telegram_auth import verify_telegram_login

    data = {
        "id": 123456789,
        "first_name": "Diyorbek",
        "username": "diyorbek",
        "auth_date": 1709856000,
        "hash": "abc123..."
    }

    is_valid = verify_telegram_login(data, bot_token="YOUR_BOT_TOKEN")
"""

import hashlib
import hmac
import time
from typing import Any


def verify_telegram_login(
    data: dict[str, Any],
    bot_token: str,
    *,
    max_age_seconds: int = 300,
) -> bool:
    """Verify a Telegram Login Widget payload.

    Args:
        data:              Dictionary of Telegram user data (must include 'hash'
                           and 'auth_date').
        bot_token:         The bot token from @BotFather (e.g. "123456:ABC-DEF").
        max_age_seconds:   Maximum allowed age for auth_date in seconds.
                           Defaults to 300 (5 minutes).

    Returns:
        True if the payload is authentic and fresh; False otherwise.
    """

    # --- 1. Shallow-copy so we don't mutate the caller's dict ------------------
    payload = dict(data)

    # --- 2. Extract and validate the hash field --------------------------------
    received_hash = payload.pop("hash", None)
    if not received_hash:
        return False

    # --- 3. Check auth_date freshness ------------------------------------------
    try:
        auth_date = int(payload["auth_date"])
    except (KeyError, ValueError, TypeError):
        return False

    if time.time() - auth_date > max_age_seconds:
        return False

    # --- 4. Build the data-check string ----------------------------------------
    #     Sort remaining key=value pairs alphabetically and join with '\n'.
    data_check_string = "\n".join(
        f"{key}={payload[key]}" for key in sorted(payload)
    )

    # --- 5. Create the secret key ----------------------------------------------
    #     SHA-256 hash of the raw bot token (as bytes).
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()

    # --- 6. HMAC-SHA256 of the data-check string using the secret key ----------
    computed_hash = hmac.new(
        key=secret_key,
        msg=data_check_string.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()

    # --- 7. Constant-time comparison to prevent timing attacks -----------------
    return hmac.compare_digest(computed_hash, received_hash)
