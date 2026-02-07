// API Types matching backend schemas

export type ParseStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'needs_review';
export type CategorySource = 'manual' | 'rule' | 'ai';

export interface Statement {
    id: number;
    filename: string;
    file_hash: string;
    file_size: number;
    source_name: string | null;
    page_count: number | null;
    period_start: string | null;
    period_end: string | null;

    // New Phase 2 Fields
    closing_balance: number | null;
    minimum_payment: number | null;
    payment_due_date: string | null;

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
    posted_day_of_week: number | null;
    posted_month: number | null;
    posted_year: number | null;
    description: string;
    amount: number;
    currency: string;
    merchant_raw: string | null;
    merchant_normalized: string | null;
    category_id: number | null;
    category_name: string | null;
    category_color: string | null;
    category_primary: string | null;
    category_detailed: string | null;
    confidence: number;
    needs_review: boolean;
    user_edited: boolean;
    excluded: boolean;
    category_source: CategorySource | null;
    raw_text: string | null;
    page_number: number | null;
    recurring_signature: string | null;
    recurring_cadence: string | null;
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
    plaid_primary: string | null;
    plaid_detailed: string | null;
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

export interface SpendByDayOfWeek {
    day_of_week: number;
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

export interface MerchantFrequency {
    merchant: string;
    total_amount: number;
    transaction_count: number;
    distinct_months: number;
    average_monthly_count: number;
}

export interface MerchantFrequencyResponse {
    merchants: MerchantFrequency[];
}


// --- New Phase 2 Types ---

export interface AppSetting {
    key: string;
    value: string;
    value_type: 'string' | 'int' | 'float' | 'bool';
}

export interface Subscription {
    id: number;
    merchant: string;
    amount: number;
    cadence: string;
    last_seen: string;
}

export interface AnalysisResponse {
    answer: string;
    generated_sql: string;
    raw_data: Record<string, any>[];
}
