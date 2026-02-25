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
    issuing_bank: Optional[str] = None
    page_count: Optional[int] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
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
    merchant_raw: Optional[str] = None
    confidence: float = 1.0
    needs_review: bool = False
    user_edited: bool = False
    category_source: Optional[CategorySource] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    raw_text: Optional[str] = None
    page_number: Optional[int] = None
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
    total_amount: float
    transaction_count: int
    percentage: float


class SpendByMonth(BaseModel):
    month: str  # YYYY-MM format
    total_amount: float
    transaction_count: int
    by_category: list[SpendByCategory] = []


class SpendByDay(BaseModel):
    day: str  # YYYY-MM-DD format
    total_amount: float
    transaction_count: int


class TopMerchant(BaseModel):
    merchant: str
    total_amount: float
    transaction_count: int
    category_name: Optional[str] = None


class SpendSummary(BaseModel):
    total_spend: float
    total_transactions: int
    average_transaction: float
    date_range_start: Optional[date] = None
    date_range_end: Optional[date] = None
    by_category: list[SpendByCategory]
    by_month: list[SpendByMonth]
    by_day: list[SpendByDay]
    top_merchants: list[TopMerchant]


class AnalyticsFilters(BaseModel):
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    category_ids: Optional[list[int]] = None
    exclude_excluded: bool = True


# --- Time Patterns / Category Hierarchy / Merchant Frequency ---


class SpendByDayOfWeek(BaseModel):
    day_of_week: int  # 0=Mon … 6=Sun
    total_amount: float
    transaction_count: int


class TimePatternsResponse(BaseModel):
    by_day_of_week: list[SpendByDayOfWeek]


class CategoryDrilldown(BaseModel):
    primary: str
    total_amount: float = 0.0
    transaction_count: int = 0
    color: str = "#9CA3AF"
    detailed: list[SpendByCategory] = []


class CategoryHierarchyResponse(BaseModel):
    categories: list[CategoryDrilldown]


class MerchantFrequency(BaseModel):
    merchant: str
    total_amount: float
    transaction_count: int
    distinct_months: int = 0
    average_monthly_count: float = 0.0


class MerchantFrequencyResponse(BaseModel):
    merchants: list[MerchantFrequency]


# --- Subscription Schemas ---


class SubscriptionResponse(BaseModel):
    id: int
    merchant: Optional[str] = None
    merchant_normalized: str
    amount: Decimal
    currency: str = "INR"
    cadence: str
    transaction_count: int = 0
    first_seen: Optional[date] = None
    last_seen: Optional[date] = None
    active: bool = True
    kind: str = "subscription"
    category_id: Optional[int] = None

    class Config:
        from_attributes = True


class SubscriptionUpdate(BaseModel):
    active: Optional[bool] = None
    kind: Optional[str] = None
    user_confirmed: Optional[bool] = None
    cadence: Optional[str] = None


# --- AppSettings Schemas ---


class AppSettingCreate(BaseModel):
    key: str
    value: str
    value_type: str = "string"


class AppSettingResponse(BaseModel):
    key: str
    value: Optional[str] = None
    value_type: Optional[str] = "string"

    class Config:
        from_attributes = True


# --- Budget Schemas ---


class BudgetCreate(BaseModel):
    scope: str = "category"  # 'total' or 'category'
    category_id: Optional[int] = None
    monthly_limit: Decimal


class BudgetResponse(BaseModel):
    id: int
    scope: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    monthly_limit: Decimal
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BudgetStatusItem(BaseModel):
    budget_id: int
    scope: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    monthly_limit: Decimal
    spent: Decimal
    percent: float
    thresholds_crossed: list[int] = []


class BudgetStatusResponse(BaseModel):
    month: str  # YYYY-MM
    items: list[BudgetStatusItem]


# --- Planning Schemas ---


class UpcomingBillItem(BaseModel):
    subscription_id: int
    merchant: str
    kind: str
    cadence: str
    amount: Decimal
    next_due_date: date
    days_until_due: int
    reminder_level: str


class UpcomingBillsResponse(BaseModel):
    window_days: int
    total_due: Decimal
    items: list[UpcomingBillItem]


class CashflowPoint(BaseModel):
    date: date
    projected_outflow: float
    projected_balance: float


class CashflowForecastResponse(BaseModel):
    days: int
    starting_cash: Decimal
    recurring_commitments: Decimal
    variable_daily_average: Decimal
    variable_projected: Decimal
    total_projected_outflow: Decimal
    projected_ending_cash: Decimal
    points: list[CashflowPoint]


class PayoffPlanRequest(BaseModel):
    current_balance: Decimal = Field(gt=Decimal("0"))
    monthly_payment: Decimal = Field(gt=Decimal("0"))
    apr_percentage: Optional[Decimal] = Field(default=None, ge=Decimal("0"))


class PayoffPlanResponse(BaseModel):
    current_balance: Decimal
    monthly_payment: Decimal
    apr_percentage: Decimal
    months_to_payoff: Optional[int]
    total_interest: Optional[Decimal]
    total_paid: Optional[Decimal]
    payoff_date: Optional[date]
    schedule: list[dict]
    status: str


class SavingsGoalItem(BaseModel):
    id: str
    name: str
    target_amount: Decimal
    current_amount: Decimal
    target_date: Optional[date] = None


class SavingsGoalsResponse(BaseModel):
    goals: list[SavingsGoalItem]


class SavingsGoalUpsertRequest(BaseModel):
    id: Optional[str] = None
    name: str = Field(min_length=1, max_length=80)
    target_amount: Decimal = Field(gt=Decimal("0"))
    current_amount: Decimal = Field(default=Decimal("0"), ge=Decimal("0"))
    target_date: Optional[date] = None


class WeeklyActionItem(BaseModel):
    kind: str
    title: str
    detail: str
    priority: str


class WeeklyActionsResponse(BaseModel):
    actions: list[WeeklyActionItem]


class RecommendationItem(BaseModel):
    kind: str
    title: str
    detail: str
    potential_savings: Optional[Decimal] = None


class RecommendationsResponse(BaseModel):
    recommendations: list[RecommendationItem]
