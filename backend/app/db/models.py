"""SQLAlchemy database models."""

import enum
from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Date,
    Numeric,
    Boolean,
    Enum,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship, DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


class ParseStatus(str, enum.Enum):
    """Status of a parse job."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    NEEDS_REVIEW = "needs_review"


class CategorySource(str, enum.Enum):
    """How a category was assigned."""

    MANUAL = "manual"
    RULE = "rule"
    AI = "ai"


class Statement(Base):
    """Uploaded credit card statement."""

    __tablename__ = "statements"

    id = Column(Integer, primary_key=True, index=True)

    # File info
    filename = Column(String(255), nullable=False)
    file_hash = Column(String(64), nullable=False, unique=True)  # SHA256
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    password = Column(String(255), nullable=True)

    # Statement metadata
    source_name = Column(String(100))  # e.g., "Chase", "Amex"
    period_start = Column(Date)
    period_end = Column(Date)
    
    # Financials (New in Phase 2)
    closing_balance = Column(Numeric(10, 2), nullable=True)
    minimum_payment = Column(Numeric(10, 2), nullable=True)
    payment_due_date = Column(Date, nullable=True)

    # Processing info
    page_count = Column(Integer)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    parse_jobs = relationship("ParseJob", back_populates="statement", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="statement", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Statement {self.id}: {self.filename}>"


class ParseJob(Base):
    """Background job for parsing a statement."""

    __tablename__ = "parse_jobs"

    id = Column(Integer, primary_key=True, index=True)
    statement_id = Column(Integer, ForeignKey("statements.id"), nullable=False)

    # Job status
    status = Column(Enum(ParseStatus), default=ParseStatus.PENDING, nullable=False)
    started_at = Column(DateTime)
    finished_at = Column(DateTime)

    # Processing details
    gemini_model = Column(String(50))
    attempt_count = Column(Integer, default=0)
    error_message = Column(Text)

    # Raw outputs (for debugging)
    raw_gemini_response = Column(Text)
    extracted_text_path = Column(String(500))

    # Stats
    transactions_found = Column(Integer, default=0)
    transactions_needs_review = Column(Integer, default=0)

    # Relationships
    statement = relationship("Statement", back_populates="parse_jobs")

    def __repr__(self):
        return f"<ParseJob {self.id}: {self.status.value}>"


class AppSettings(Base):
    """User preferences (Singleton/Key-Value storage)."""

    __tablename__ = "settings"

    key = Column(String(50), primary_key=True, index=True)
    value = Column(String(255), nullable=True)
    value_type = Column(String(20), default="string")  # string, int, float, bool


class Category(Base):
    """Spending category."""

    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(String(255))
    plaid_primary = Column(String(100))
    plaid_detailed = Column(String(150))
    color = Column(String(7), default="#6B7280")  # Hex color
    icon = Column(String(50))  # Icon name
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    transactions = relationship("Transaction", back_populates="category")
    rules = relationship("CategoryRule", back_populates="category", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Category {self.id}: {self.name}>"


class Transaction(Base):
    """Parsed transaction from a statement."""

    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    statement_id = Column(Integer, ForeignKey("statements.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"))

    # Transaction data
    posted_date = Column(Date, nullable=False)
    posted_day_of_week = Column(Integer)
    posted_month = Column(Integer)
    posted_year = Column(Integer)
    description = Column(String(500), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), default="INR")

    # Merchant info
    merchant_raw = Column(String(255))  # Original from statement
    merchant_normalized = Column(String(255))  # Cleaned up

    # Parsing metadata
    confidence = Column(Numeric(3, 2), default=1.0)  # 0.00 to 1.00
    needs_review = Column(Boolean, default=False)
    user_edited = Column(Boolean, default=False)
    excluded = Column(Boolean, default=False)  # User excluded from analysis

    # Category assignment
    category_source = Column(Enum(CategorySource))
    category_primary = Column(String(100))
    category_detailed = Column(String(150))

    # Deduplication
    dedup_hash = Column(String(64), index=True)  # Hash of date+desc+amount

    # Recurring analysis
    recurring_signature = Column(String(64), index=True)
    recurring_cadence = Column(String(20))

    # Audit
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Raw source (for debugging)
    raw_text = Column(Text)
    page_number = Column(Integer)

    # Relationships
    statement = relationship("Statement", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")

    __table_args__ = (
        Index("ix_transactions_posted_date", "posted_date"),
        Index("ix_transactions_category", "category_id"),
        Index("ix_transactions_posted_year_month", "posted_year", "posted_month"),
    )

    def __repr__(self):
        return f"<Transaction {self.id}: {self.posted_date} {self.amount}>"


class CategoryRule(Base):
    """Rule for auto-categorizing transactions."""

    __tablename__ = "category_rules"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)

    # Rule definition
    pattern = Column(String(255), nullable=False)  # Regex or contains match
    is_regex = Column(Boolean, default=False)
    match_field = Column(String(50), default="merchant_normalized")  # Field to match against

    # Priority (lower = higher priority)
    priority = Column(Integer, default=100)
    enabled = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    category = relationship("Category", back_populates="rules")

    __table_args__ = (Index("ix_category_rules_priority", "priority"),)

    def __repr__(self):
        return f"<CategoryRule {self.id}: {self.pattern} -> {self.category_id}>"


class Subscription(Base):
    """Detected or tracked subscription/recurring payment."""

    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    merchant = Column(String(255), nullable=False)
    merchant_normalized = Column(String(255))
    amount = Column(Numeric(12, 2))
    currency = Column(String(3), default="INR")
    cadence = Column(String(50))  # e.g., monthly, yearly
    kind = Column(String(20))  # e.g., "subscription", "installment"
    first_seen = Column(Date)
    last_seen = Column(Date)
    transaction_count = Column(Integer, default=0)
    category_id = Column(Integer, ForeignKey("categories.id"))

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("Category")

    __table_args__ = (
        Index("ix_subscriptions_merchant_norm", "merchant_normalized"),
    )

    def __repr__(self):
        return f"<Subscription {self.id}: {self.merchant} {self.amount} {self.cadence}>"

# Default categories to seed
DEFAULT_CATEGORIES = [
    {"name": "Food & Dining", "color": "#EF4444", "icon": "utensils", "is_default": True},
    {"name": "Groceries", "color": "#F97316", "icon": "shopping-cart", "is_default": True},
    {"name": "Shopping", "color": "#F59E0B", "icon": "shopping-bag", "is_default": True},
    {"name": "Transportation", "color": "#EAB308", "icon": "car", "is_default": True},
    {"name": "Entertainment", "color": "#84CC16", "icon": "film", "is_default": True},
    {"name": "Bills & Utilities", "color": "#22C55E", "icon": "file-text", "is_default": True},
    {"name": "Healthcare", "color": "#14B8A6", "icon": "heart", "is_default": True},
    {"name": "Travel", "color": "#06B6D4", "icon": "plane", "is_default": True},
    {"name": "Education", "color": "#3B82F6", "icon": "book", "is_default": True},
    {"name": "Subscriptions", "color": "#6366F1", "icon": "repeat", "is_default": True},
    {"name": "Personal Care", "color": "#8B5CF6", "icon": "smile", "is_default": True},
    {"name": "Gifts & Donations", "color": "#A855F7", "icon": "gift", "is_default": True},
    {"name": "Fees & Charges", "color": "#D946EF", "icon": "alert-circle", "is_default": True},
    {"name": "Income", "color": "#10B981", "icon": "trending-up", "is_default": True},
    {"name": "Transfer", "color": "#6B7280", "icon": "repeat", "is_default": True},
    {"name": "Other", "color": "#9CA3AF", "icon": "more-horizontal", "is_default": True},
]
