// API Types matching backend schemas

export type ParseStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'needs_review';
export type CategorySource = 'manual' | 'rule' | 'ai';

export interface Statement {
    id: number;
    filename: string;
    file_hash: string;
    file_size: number;
    issuing_bank: string | null;
    source_name: string | null;
    page_count: number | null;
    period_start: string | null;
    period_end: string | null;
    uploaded_at: string;
    transaction_count: number;
    needs_review_count: number;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'needs_review';
}

export interface StatementListResponse {
    statements: Statement[];
    total: number;
}

export interface ParseJob {
    id: number;
    statement_id: number;
    status: ParseStatus;
    started_at: string | null;
    finished_at: string | null;
    gemini_model: string | null;
    attempt_count: number;
    error_message: string | null;
    transactions_found: number;
    transactions_needs_review: number;
}

export interface Transaction {
    id: number;
    statement_id: number;
    posted_date: string;
    description: string;
    amount: number;
    currency: string;
    merchant_raw: string | null;
    merchant_normalized: string | null;
    category_id: number | null;
    category_name: string | null;
    category_color: string | null;
    confidence: number;
    needs_review: boolean;
    user_edited: boolean;
    excluded: boolean;
    category_source: CategorySource | null;
    raw_text: string | null;
    page_number: number | null;
    created_at: string;
}

export interface TransactionListResponse {
    transactions: Transaction[];
    total: number;
    total_amount: number;
}

export interface TransactionUpdate {
    posted_date?: string;
    description?: string;
    amount?: number;
    merchant_normalized?: string;
    category_id?: number | null;
    excluded?: boolean;
    needs_review?: boolean;
}

export interface Category {
    id: number;
    name: string;
    description: string | null;
    color: string;
    icon: string | null;
    is_default: boolean;
    transaction_count: number;
    total_amount: number;
    created_at: string;
}

export interface CategoryListResponse {
    categories: Category[];
}

export interface CategoryCreate {
    name: string;
    description?: string;
    color?: string;
    icon?: string;
}

export interface SpendByCategory {
    category_id: number | null;
    category_name: string;
    category_color: string;
    total_amount: number;
    transaction_count: number;
    percentage: number;
}

export interface SpendByMonth {
    month: string;
    total_amount: number;
    transaction_count: number;
    by_category: SpendByCategory[];
}

export interface SpendByDay {
    day: string;
    total_amount: number;
    transaction_count: number;
}

export interface TopMerchant {
    merchant: string;
    total_amount: number;
    transaction_count: number;
    category_name: string | null;
}

export interface SpendSummary {
    total_spend: number;
    total_transactions: number;
    average_transaction: number;
    date_range_start: string | null;
    date_range_end: string | null;
    by_category: SpendByCategory[];
    by_month: SpendByMonth[];
    by_day: SpendByDay[];
    top_merchants: TopMerchant[];
}

// --- Time Patterns / Hierarchy / Merchant Frequency ---

export interface SpendByDayOfWeek {
    day_of_week: number;
    total_amount: number;
    transaction_count: number;
}

export interface TimePatternsResponse {
    by_day_of_week: SpendByDayOfWeek[];
}

export interface CategoryDrilldown {
    primary: string;
    total_amount: number;
    transaction_count: number;
    color: string;
    detailed: SpendByCategory[];
}

export interface CategoryHierarchyResponse {
    categories: CategoryDrilldown[];
}

export interface MerchantFrequencyItem {
    merchant: string;
    total_amount: number;
    transaction_count: number;
    distinct_months: number;
    average_monthly_count: number;
}

export interface MerchantFrequencyResponse {
    merchants: MerchantFrequencyItem[];
}

// --- Subscriptions ---

export interface Subscription {
    id: number;
    merchant: string | null;
    merchant_normalized: string;
    amount: number;
    currency: string;
    cadence: string;
    transaction_count: number;
    first_seen: string | null;
    last_seen: string | null;
    active: boolean;
    kind: string;
    category_id: number | null;
    user_confirmed: boolean;
}

export interface SubscriptionSummary {
    subscription_count: number;
    subscription_monthly: number;
    emi_count: number;
    emi_monthly: number;
    possible_emi_count: number;
    possible_emi_monthly: number;
    total_monthly_committed: number;
}

// --- Settings ---

export interface AppSetting {
    key: string;
    value: string | null;
    value_type: string | null;
}

// --- Analysis ---

export interface AnalysisResponse {
    answer: string;
    generated_sql: string;
    raw_data: Record<string, any>[];
}

// --- Budgets ---

export interface Budget {
    id: number;
    scope: string;
    category_id: number | null;
    category_name: string | null;
    category_color: string | null;
    monthly_limit: number;
    created_at: string;
    updated_at: string;
}

export interface BudgetStatusItem {
    budget_id: number;
    scope: string;
    category_id: number | null;
    category_name: string | null;
    category_color: string | null;
    monthly_limit: number;
    spent: number;
    percent: number;
    thresholds_crossed: number[];
}

export interface BudgetStatusResponse {
    month: string;
    items: BudgetStatusItem[];
}

// --- Triggers ---

export interface Trigger {
    type: string;
    title: string;
    severity: 'info' | 'warning' | 'alert';
    reason: string;
    stats: Record<string, any>;
    transaction_ids: number[];
}

// --- Planning ---

export interface UpcomingBill {
    subscription_id: number;
    merchant: string;
    kind: string;
    cadence: string;
    amount: number;
    next_due_date: string;
    days_until_due: number;
    reminder_level: 'soon' | 'upcoming' | 'urgent';
}

export interface UpcomingBillsResponse {
    window_days: number;
    total_due: number;
    items: UpcomingBill[];
}

export interface CashflowPoint {
    date: string;
    projected_outflow: number;
    projected_balance: number;
}

export interface CashflowForecastResponse {
    days: number;
    starting_cash: number;
    recurring_commitments: number;
    variable_daily_average: number;
    variable_projected: number;
    total_projected_outflow: number;
    projected_ending_cash: number;
    points: CashflowPoint[];
}

export interface PayoffPlanRequest {
    current_balance: number;
    monthly_payment: number;
    apr_percentage?: number;
}

export interface PayoffScheduleRow {
    month: number;
    date: string;
    starting_balance: number;
    interest: number;
    payment: number;
    principal: number;
    ending_balance: number;
}

export interface PayoffPlanResponse {
    current_balance: number;
    monthly_payment: number;
    apr_percentage: number;
    months_to_payoff: number | null;
    total_interest: number | null;
    total_paid: number | null;
    payoff_date: string | null;
    schedule: PayoffScheduleRow[];
    status: 'ok' | 'payment_too_low' | 'invalid_payment' | 'max_months_exceeded' | 'paid';
}

export interface SavingsGoal {
    id: string;
    name: string;
    target_amount: number;
    current_amount: number;
    target_date: string | null;
}

export interface SavingsGoalsResponse {
    goals: SavingsGoal[];
}

export interface SavingsGoalPayload {
    id?: string;
    name: string;
    target_amount: number;
    current_amount: number;
    target_date?: string;
}

export interface WeeklyAction {
    kind: string;
    title: string;
    detail: string;
    priority: 'high' | 'medium' | 'low';
}

export interface WeeklyActionsResponse {
    actions: WeeklyAction[];
}

export interface Recommendation {
    kind: string;
    title: string;
    detail: string;
    potential_savings: number | null;
}

export interface RecommendationsResponse {
    recommendations: Recommendation[];
}
