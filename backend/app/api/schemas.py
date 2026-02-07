"""API schemas for request/response validation."""

from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field

from app.db.models import ParseStatus, CategorySource


# --- Statement Schemas ---


class StatementBase(BaseModel):
    source_name: Optional[str] = None


class StatementCreate(StatementBase):
    pass


class StatementResponse(StatementBase):
    id: int
    filename: str
    file_hash: str
    file_size: int
    page_count: Optional[int] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    
    closing_balance: Optional[Decimal] = None
    minimum_payment: Optional[Decimal] = None
    payment_due_date: Optional[date] = None
    
    uploaded_at: datetime
    transaction_count: int = 0
    needs_review_count: int = 0
    status: Optional[ParseStatus] = None

    class Config:
        from_attributes = True


class StatementListResponse(BaseModel):
    statements: list[StatementResponse]
    total: int


# --- Parse Job Schemas ---


class ParseJobResponse(BaseModel):
    id: int
    statement_id: int
    status: ParseStatus
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    gemini_model: Optional[str] = None
    attempt_count: int
    error_message: Optional[str] = None
    transactions_found: int = 0
    transactions_needs_review: int = 0

    class Config:
        from_attributes = True


# --- Transaction Schemas ---


class TransactionBase(BaseModel):
    posted_date: date
    description: str
    amount: Decimal
    currency: str = "INR"
    merchant_normalized: Optional[str] = None
    category_id: Optional[int] = None
    excluded: bool = False


class TransactionUpdate(BaseModel):
    posted_date: Optional[date] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    merchant_normalized: Optional[str] = None
    category_id: Optional[int] = None
    excluded: Optional[bool] = None
    needs_review: Optional[bool] = None


class TransactionResponse(TransactionBase):
    id: int
    statement_id: int
    posted_day_of_week: Optional[int] = None
    posted_month: Optional[int] = None
    posted_year: Optional[int] = None
    merchant_raw: Optional[str] = None
    confidence: float = 1.0
    needs_review: bool = False
    user_edited: bool = False
    category_source: Optional[CategorySource] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    category_primary: Optional[str] = None
    category_detailed: Optional[str] = None

    class Config:
        from_attributes = True


# --- Settings Schemas ---


class AppSettingCreate(BaseModel):
    key: str
    value: str
    value_type: str = "string"


class AppSettingResponse(AppSettingCreate):
    pass
    
    class Config:
        from_attributes = True


# --- Subscription Schemas ---


class SubscriptionResponse(BaseModel):
    id: int
    merchant: str
    amount: Decimal
    cadence: Optional[str] = None
    last_seen: Optional[date] = None
    kind: Optional[str] = "subscription"
    # detected_at: datetime # Not in original model, use created_at
    
    class Config:
        from_attributes = True
    raw_text: Optional[str] = None
    page_number: Optional[int] = None
    recurring_signature: Optional[str] = None
    recurring_cadence: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionListResponse(BaseModel):
    transactions: list[TransactionResponse]
    total: int
    total_amount: Decimal = Decimal("0")


class BulkCategorizeRequest(BaseModel):
    transaction_ids: list[int]
    category_id: int


# --- Category Schemas ---


class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#6B7280"
    icon: Optional[str] = None


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class CategoryResponse(CategoryBase):
    id: int
    is_default: bool
    plaid_primary: Optional[str] = None
    plaid_detailed: Optional[str] = None
    transaction_count: int = 0
    total_amount: Decimal = Decimal("0")
    created_at: datetime

    class Config:
        from_attributes = True


class CategoryListResponse(BaseModel):
    categories: list[CategoryResponse]


# --- Category Rule Schemas ---


class CategoryRuleBase(BaseModel):
    pattern: str
    is_regex: bool = False
    match_field: str = "merchant_normalized"
    priority: int = 100
    enabled: bool = True


class CategoryRuleCreate(CategoryRuleBase):
    category_id: int


class CategoryRuleResponse(CategoryRuleBase):
    id: int
    category_id: int
    category_name: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Analytics Schemas ---


class SpendByCategory(BaseModel):
    category_id: Optional[int]
    category_name: str
    category_color: str
    total_amount: Decimal
    transaction_count: int
    percentage: float


class SpendByMonth(BaseModel):
    month: str  # YYYY-MM format
    total_amount: Decimal
    transaction_count: int
    by_category: list[SpendByCategory] = []


class SpendByDay(BaseModel):
    day: str  # YYYY-MM-DD format
    total_amount: Decimal
    transaction_count: int


class SpendByDayOfWeek(BaseModel):
    day_of_week: int  # 0=Mon ... 6=Sun
    total_amount: Decimal
    transaction_count: int


class TopMerchant(BaseModel):
    merchant: str
    total_amount: Decimal
    transaction_count: int
    category_name: Optional[str] = None


class SpendSummary(BaseModel):
    total_spend: Decimal
    total_transactions: int
    average_transaction: Decimal
    date_range_start: Optional[date] = None
    date_range_end: Optional[date] = None
    by_category: list[SpendByCategory]
    by_month: list[SpendByMonth]
    by_day: list[SpendByDay]
    top_merchants: list[TopMerchant]


class TimePatternsResponse(BaseModel):
    by_day_of_week: list[SpendByDayOfWeek]


class CategoryDrilldown(BaseModel):
    primary: str
    total_amount: Decimal
    transaction_count: int
    color: str
    detailed: list[SpendByCategory]


class CategoryHierarchyResponse(BaseModel):
    categories: list[CategoryDrilldown]


class MerchantFrequency(BaseModel):
    merchant: str
    total_amount: Decimal
    transaction_count: int
    distinct_months: int
    average_monthly_count: float


class MerchantFrequencyResponse(BaseModel):
    merchants: list[MerchantFrequency]


class AnalyticsFilters(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    category_ids: Optional[list[int]] = None
    exclude_excluded: bool = True
