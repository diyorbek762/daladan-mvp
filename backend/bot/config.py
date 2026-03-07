"""
Daladan Bot — Configuration
============================
Reads secrets from environment variables (or a .env file via python-dotenv).
"""

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()  # loads .env in project root, if present


@dataclass(frozen=True)
class Config:
    """Immutable application configuration."""

    bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    db_dsn: str = os.getenv(
        "DATABASE_URL",
        # Fallback: build DSN from individual Supabase vars
        f"postgresql://{os.getenv('DB_USER', 'postgres')}"
        f":{os.getenv('DB_PASSWORD', '')}"
        f"@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}"
        f"/{os.getenv('DB_NAME', 'postgres')}",
    )

    def validate(self) -> None:
        """Raise early if critical values are missing."""
        if not self.bot_token:
            raise ValueError("TELEGRAM_BOT_TOKEN is not set.")
        if "localhost" in self.db_dsn and not os.getenv("DATABASE_URL"):
            raise ValueError(
                "DATABASE_URL (or DB_HOST / DB_PASSWORD) is not set. "
                "Point it at your Supabase Postgres connection string."
            )


config = Config()
