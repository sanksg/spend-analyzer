"""Reset the database to the current schema and seed Phase 1 data.

This script will:
- If using a local SQLite file (settings.database_url starts with "sqlite:"), remove the file.
- Call `init_db()` to recreate tables and run any backfill/seed logic.

Use cautiously: this will destroy the existing SQLite database file.
"""

from pathlib import Path
import sys
import logging

from app.config import settings
from app.db.session import init_db

logger = logging.getLogger("reset_phase1_db")
logging.basicConfig(level=logging.INFO)


def remove_sqlite_file_if_present(database_url: str) -> None:
    """If database_url points to a local sqlite file, delete it."""
    if not database_url.startswith("sqlite:"):
        logger.info("Database is not SQLite; skipping file removal.")
        return

    # Handle URLs like sqlite:///./data/spend.db or sqlite:////absolute/path.db
    path_part = database_url.split("sqlite:///")[-1]
    db_path = Path(path_part)
    if not db_path.is_absolute():
        db_path = Path.cwd() / db_path

    if db_path.exists():
        logger.info(f"Removing SQLite database file: {db_path}")
        try:
            db_path.unlink()
        except Exception as exc:
            logger.error(f"Failed to remove {db_path}: {exc}")
            raise
    else:
        logger.info(f"No SQLite file found at {db_path}; nothing to remove.")


def main() -> int:
    logger.info("Starting Phase 1 DB reset")
    try:
        remove_sqlite_file_if_present(settings.database_url)
        init_db()
        logger.info("Database reset and initialized successfully.")
        return 0
    except Exception:
        logger.exception("Failed to reset database")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
