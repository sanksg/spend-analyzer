// src/api/budgets.ts
import { fetchApi } from './client';
import type { Budget, BudgetStatusResponse, Trigger, SubscriptionSummary } from '../types';

// --- Budgets ---

export const getBudgets = async (): Promise<Budget[]> => {
    return fetchApi<Budget[]>('/budgets/');
};

export const createOrUpdateBudget = async (
    scope: string,
    monthly_limit: number,
    category_id?: number | null,
): Promise<Budget> => {
    return fetchApi<Budget>('/budgets/', {
        method: 'POST',
        body: JSON.stringify({ scope, category_id: category_id ?? null, monthly_limit }),
    });
};

export const deleteBudget = async (id: number): Promise<void> => {
    await fetchApi(`/budgets/${id}`, { method: 'DELETE' });
};

export const getBudgetStatus = async (month?: string): Promise<BudgetStatusResponse> => {
    const params = month ? `?month=${month}` : '';
    return fetchApi<BudgetStatusResponse>(`/budgets/status${params}`);
};

// --- Triggers ---

export const getTriggers = async (month?: string): Promise<Trigger[]> => {
    const params = month ? `?month=${month}` : '';
    return fetchApi<Trigger[]>(`/insights/triggers${params}`);
};

// --- Subscription Summary ---

export const getSubscriptionSummary = async (): Promise<SubscriptionSummary> => {
    return fetchApi<SubscriptionSummary>('/insights/subscriptions/summary');
};
