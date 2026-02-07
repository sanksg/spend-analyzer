"""
Migration script for Phase 2.
Adds new columns to 'statements' table and creates new tables.
"""
import sys
import logging
from sqlalchemy import text
from app.db.session import engine, init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate():
    with engine.connect() as conn:
        logger.info("Migrating 'statements' table...")
        try:
            # SQLite does not support IF NOT EXISTS in ADD COLUMN
            # We wrap in try/except to ignore if already exists
            conn.execute(text("ALTER TABLE statements ADD COLUMN closing_balance NUMERIC(10, 2)"))
            conn.execute(text("ALTER TABLE statements ADD COLUMN minimum_payment NUMERIC(10, 2)"))
            conn.execute(text("ALTER TABLE statements ADD COLUMN payment_due_date DATE"))
            logger.info("Added columns to 'statements'.")
        except Exception as e:
            if "duplicate column" in str(e).lower():
                logger.info("Columns already exist in 'statements'.")
            else:
                logger.warning(f"Note: {e}")

        conn.commit()

    # Create new tables (Settings, Subscriptions)
    logger.info("Creating new tables (Settings, Subscriptions)...")
    init_db()
    logger.info("Migration complete.")

if __name__ == "__main__":
    migrate()
