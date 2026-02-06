"""Database session management."""

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

from app.config import settings
from app.db.models import Base, Category, DEFAULT_CATEGORIES, Transaction, Subscription
from app.utils.transaction_utils import (
    derive_date_parts,
    normalize_merchant_name,
    compute_recurring_signature,
    get_category_parts,
    extract_category_parts,
)


# Create engine
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False},  # SQLite specific
    echo=False,
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Initialize database tables and seed default data."""
    # Create all tables
    Base.metadata.create_all(bind=engine)

    # Ensure new columns exist for SQLite without migrations
    ensure_sqlite_schema(engine)

    # Seed default categories if none exist
    with SessionLocal() as db:
        existing = db.query(Category).first()
        if not existing:
            for cat_data in DEFAULT_CATEGORIES:
                category = Category(**cat_data)
                db.add(category)
            db.commit()

        backfill_category_fields(db)
        backfill_transaction_fields(db)
        backfill_subscription_fields(db)


def get_db() -> Generator[Session, None, None]:
    """Dependency for getting database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_sqlite_schema(db_engine) -> None:
    """Add missing columns for SQLite databases to keep schema up to date."""
    if db_engine.dialect.name != "sqlite":
        return

    inspector = inspect(db_engine)

    def ensure_column(table_name: str, column_name: str, column_def: str) -> None:
        existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
        if column_name in existing_columns:
            return
        with db_engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}"))

    # Transactions table additions
    ensure_column("transactions", "posted_day_of_week", "INTEGER")
    ensure_column("transactions", "posted_month", "INTEGER")
    ensure_column("transactions", "posted_year", "INTEGER")
    ensure_column("transactions", "category_primary", "VARCHAR(100)")
    ensure_column("transactions", "category_detailed", "VARCHAR(150)")
    ensure_column("transactions", "recurring_signature", "VARCHAR(64)")
    ensure_column("transactions", "recurring_cadence", "VARCHAR(20)")

    # Categories table additions
    ensure_column("categories", "plaid_primary", "VARCHAR(100)")
    ensure_column("categories", "plaid_detailed", "VARCHAR(150)")

    # Subscriptions table additions
    ensure_column("subscriptions", "merchant", "VARCHAR(255)")
    ensure_column("subscriptions", "merchant_normalized", "VARCHAR(255)")
    ensure_column("subscriptions", "amount", "NUMERIC")
    ensure_column("subscriptions", "currency", "VARCHAR(3)")
    ensure_column("subscriptions", "cadence", "VARCHAR(50)")
    ensure_column("subscriptions", "first_seen", "DATE")
    ensure_column("subscriptions", "last_seen", "DATE")
    ensure_column("subscriptions", "transaction_count", "INTEGER")
    ensure_column("subscriptions", "category_id", "INTEGER")
    ensure_column("subscriptions", "created_at", "DATETIME")
    ensure_column("subscriptions", "updated_at", "DATETIME")
    ensure_column("subscriptions", "kind", "VARCHAR(20)")


def backfill_category_fields(db: Session) -> None:
    """Backfill Plaid primary/detailed fields for existing categories."""
    categories = db.query(Category).all()
    updated = False

    for category in categories:
        if category.plaid_primary or category.plaid_detailed:
            continue

        primary, detailed = extract_category_parts(category.name)
        if primary != category.name or detailed is not None:
            category.plaid_primary = primary
            category.plaid_detailed = detailed
            updated = True

    if updated:
        db.commit()


def backfill_transaction_fields(db: Session) -> None:
    """Backfill derived fields for existing transactions."""
    transactions = (
        db.query(Transaction)
        .filter(
            (Transaction.posted_year.is_(None))
            | (Transaction.posted_month.is_(None))
            | (Transaction.posted_day_of_week.is_(None))
            | (Transaction.merchant_normalized.is_(None))
            | (Transaction.recurring_signature.is_(None))
            | (Transaction.category_primary.is_(None))
        )
        .yield_per(200)
    )

    updated = False
    for txn in transactions:
        if txn.posted_date and (txn.posted_day_of_week is None or txn.posted_month is None or txn.posted_year is None):
            day_of_week, month, year = derive_date_parts(txn.posted_date)
            txn.posted_day_of_week = day_of_week
            txn.posted_month = month
            txn.posted_year = year
            updated = True

        if txn.merchant_normalized is None:
            txn.merchant_normalized = normalize_merchant_name(txn.merchant_raw, txn.description)
            updated = True

        if txn.category_id and (txn.category_primary is None or txn.category_detailed is None):
            if txn.category:
                txn.category_primary, txn.category_detailed = get_category_parts(txn.category)
                updated = True

        if txn.recurring_signature is None:
            txn.recurring_signature = compute_recurring_signature(txn.merchant_normalized, txn.amount)
            updated = True

    if updated:
        db.commit()


def backfill_subscription_fields(db: Session) -> None:
    """Backfill default kind for subscriptions when missing."""
    updated = False
    for subscription in db.query(Subscription).filter(Subscription.kind.is_(None)).all():
        subscription.kind = "subscription"
        updated = True

    if updated:
        db.commit()
