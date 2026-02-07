// API client for backend communication

import type {
    Statement,
    StatementListResponse,
    ParseJob,
    Transaction,
    TransactionListResponse,
    TransactionUpdate,
    Category,
    CategoryListResponse,
    CategoryCreate,
    SpendSummary,
    TimePatternsResponse,
    CategoryHierarchyResponse,
    MerchantFrequencyResponse,
} from '../types';

const API_BASE = '/api';

export async function fetchApi<T>(
    endpoint: string,
    options?: RequestInit
): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers,
            },
            ...options,
        });
    } catch (err) {
        throw new Error('Unable to reach the backend. Is the API running on http://localhost:8000?');
    }

    if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        const text = await response.text().catch(() => 'Unknown error');
        throw new Error(text || `HTTP ${response.status}`);
    }

    return response.json();
}

// --- Statements ---

export async function uploadStatement(file: File, password?: string): Promise<Statement> {
    const formData = new FormData();
    formData.append('file', file);
    if (password) {
        formData.append('password', password);
    }

    let response: Response;
    try {
        response = await fetch(`${API_BASE}/statements/upload`, {
            method: 'POST',
            body: formData,
        });
    } catch (err) {
        throw new Error('Unable to reach the backend. Is the API running on http://localhost:8000?');
    }

    if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
            throw new Error(error.detail || `HTTP ${response.status}`);
        }

        const text = await response.text().catch(() => 'Upload failed');
        throw new Error(text || `HTTP ${response.status}`);
    }

    return response.json();
}

export async function getStatements(
    skip = 0,
    limit = 50
): Promise<StatementListResponse> {
    return fetchApi(`/statements?skip=${skip}&limit=${limit}`);
}

export async function getStatement(id: number): Promise<Statement> {
    return fetchApi(`/statements/${id}`);
}

export async function getStatementJobs(id: number): Promise<ParseJob[]> {
    return fetchApi(`/statements/${id}/jobs`);
}

export async function reparseStatement(id: number): Promise<ParseJob> {
    return fetchApi(`/statements/${id}/reparse`, { method: 'POST' });
}

export async function deleteStatement(id: number): Promise<void> {
    await fetchApi(`/statements/${id}`, { method: 'DELETE' });
}

// --- Transactions ---

export interface TransactionFilters {
    statement_id?: number;
    category_id?: number;
    needs_review?: boolean;
    excluded?: boolean;
    start_date?: string;
    end_date?: string;
    search?: string;
    skip?: number;
    limit?: number;
}

export async function getTransactions(
    filters: TransactionFilters = {}
): Promise<TransactionListResponse> {
    const params = new URLSearchParams();

    if (filters.statement_id !== undefined) params.set('statement_id', String(filters.statement_id));
    if (filters.category_id !== undefined) params.set('category_id', String(filters.category_id));
    if (filters.needs_review !== undefined) params.set('needs_review', String(filters.needs_review));
    if (filters.excluded !== undefined) params.set('excluded', String(filters.excluded));
    if (filters.start_date) params.set('start_date', filters.start_date);
    if (filters.end_date) params.set('end_date', filters.end_date);
    if (filters.search) params.set('search', filters.search);
    if (filters.skip !== undefined) params.set('skip', String(filters.skip));
    if (filters.limit !== undefined) params.set('limit', String(filters.limit));

    return fetchApi(`/transactions?${params.toString()}`);
}

export async function getTransaction(id: number): Promise<Transaction> {
    return fetchApi(`/transactions/${id}`);
}

export async function updateTransaction(
    id: number,
    update: TransactionUpdate
): Promise<Transaction> {
    return fetchApi(`/transactions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(update),
    });
}

export async function bulkCategorize(
    transactionIds: number[],
    categoryId: number
): Promise<void> {
    await fetchApi('/transactions/bulk-categorize', {
        method: 'POST',
        body: JSON.stringify({
            transaction_ids: transactionIds,
            category_id: categoryId,
        }),
    });
}

export async function approveTransaction(id: number): Promise<Transaction> {
    return fetchApi(`/transactions/${id}/approve`, { method: 'POST' });
}

export async function deleteTransaction(id: number): Promise<void> {
    await fetchApi(`/transactions/${id}`, { method: 'DELETE' });
}

// --- Categories ---

export async function getCategories(): Promise<CategoryListResponse> {
    return fetchApi('/categories');
}

export async function createCategory(data: CategoryCreate): Promise<Category> {
    return fetchApi('/categories', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateCategory(
    id: number,
    data: Partial<CategoryCreate>
): Promise<Category> {
    return fetchApi(`/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
}

export async function deleteCategory(id: number): Promise<void> {
    await fetchApi(`/categories/${id}`, { method: 'DELETE' });
}

export async function importPlaidCategories(reset = true, reclassify = true): Promise<void> {
    await fetchApi(`/categories/import-plaid?reset=${reset}&reclassify=${reclassify}`, { method: 'POST' });
}

// --- Analytics ---

export interface AnalyticsFilters {
    start_date?: string;
    end_date?: string;
    category_ids?: number[];
    statement_id?: number;
    merchant?: string;
}

export async function getSpendSummary(
    filters: AnalyticsFilters = {}
): Promise<SpendSummary> {
    const params = new URLSearchParams();

    if (filters.start_date) params.set('start_date', filters.start_date);
    if (filters.end_date) params.set('end_date', filters.end_date);
    if (filters.category_ids?.length) {
        params.set('category_ids', filters.category_ids.join(','));
    }
    if (filters.statement_id !== undefined) params.set('statement_id', String(filters.statement_id));
    if (filters.merchant) params.set('merchant', filters.merchant);

    return fetchApi(`/analytics/summary?${params.toString()}`);
}

export async function getTimePatterns(
    filters: AnalyticsFilters = {}
): Promise<TimePatternsResponse> {
    const params = new URLSearchParams();

    if (filters.start_date) params.set('start_date', filters.start_date);
    if (filters.end_date) params.set('end_date', filters.end_date);
    if (filters.category_ids?.length) {
        params.set('category_ids', filters.category_ids.join(','));
    }
    if (filters.statement_id !== undefined) params.set('statement_id', String(filters.statement_id));
    if (filters.merchant) params.set('merchant', filters.merchant);

    return fetchApi(`/analytics/time-patterns?${params.toString()}`);
}

export async function getCategoryHierarchy(
    filters: AnalyticsFilters = {}
): Promise<CategoryHierarchyResponse> {
    const params = new URLSearchParams();

    if (filters.start_date) params.set('start_date', filters.start_date);
    if (filters.end_date) params.set('end_date', filters.end_date);
    if (filters.category_ids?.length) {
        params.set('category_ids', filters.category_ids.join(','));
    }
    if (filters.statement_id !== undefined) params.set('statement_id', String(filters.statement_id));
    if (filters.merchant) params.set('merchant', filters.merchant);

    return fetchApi(`/analytics/category-hierarchy?${params.toString()}`);
}

export async function getMerchantFrequency(
    filters: AnalyticsFilters = {}
): Promise<MerchantFrequencyResponse> {
    const params = new URLSearchParams();

    if (filters.start_date) params.set('start_date', filters.start_date);
    if (filters.end_date) params.set('end_date', filters.end_date);
    if (filters.category_ids?.length) {
        params.set('category_ids', filters.category_ids.join(','));
    }
    if (filters.statement_id !== undefined) params.set('statement_id', String(filters.statement_id));
    if (filters.merchant) params.set('merchant', filters.merchant);

    return fetchApi(`/analytics/merchant-frequency?${params.toString()}`);
}

// --- Phase 2: Subscriptions API ---

export async function detectSubscriptions(minOccurrences: number = 2): Promise<any> {
    return fetchApi(`/subscriptions/detect?min_occurrences=${minOccurrences}`, {
        method: 'POST',
    });
}

export async function getSubscriptions(activeOnly: boolean = false): Promise<any> {
    return fetchApi(`/subscriptions/?active_only=${activeOnly}`);
}

export async function getSubscription(id: number): Promise<any> {
    return fetchApi(`/subscriptions/${id}`);
}

export async function updateSubscription(id: number, data: { active?: boolean; user_confirmed?: boolean }): Promise<any> {
    return fetchApi(`/subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
}

export async function deleteSubscription(id: number): Promise<any> {
    return fetchApi(`/subscriptions/${id}`, {
        method: 'DELETE',
    });
}

// --- Phase 2: Anomalies API ---

export async function detectAnomalies(zThreshold: number = 2.5, minTransactions: number = 5): Promise<any> {
    return fetchApi(`/analytics/anomalies/detect?z_threshold=${zThreshold}&min_transactions=${minTransactions}`, {
        method: 'POST',
    });
}

export async function getAnomalies(includeDismissed: boolean = false): Promise<any> {
    return fetchApi(`/analytics/anomalies?include_dismissed=${includeDismissed}`);
}

export async function dismissAnomaly(id: number): Promise<any> {
    return fetchApi(`/analytics/anomalies/${id}/dismiss`, {
        method: 'POST',
    });
}

// --- Phase 2: Financial Health API ---

export async function createOrUpdateProfile(data: {
    credit_limit?: number | null;
    apr?: number | null;
    statement_closing_day?: number | null;
    min_payment_percent?: number;
}): Promise<any> {
    return fetchApi('/financial/profile', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function getProfile(): Promise<any> {
    return fetchApi('/financial/profile');
}

export async function getCreditHealth(): Promise<any> {
    return fetchApi('/financial/credit-health');
}

export async function getInterestCost(): Promise<any> {
    return fetchApi('/financial/interest-cost');
}
