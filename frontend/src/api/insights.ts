// src/api/insights.ts
import { fetchApi } from './client';
import { Subscription, AnalysisResponse } from '../types';

export const scanSubscriptions = async () => {
    return fetchApi<{ data: number, message: string }>('/insights/subscriptions/scan', {
        method: 'POST'
    });
};

export const getSubscriptions = async (): Promise<Subscription[]> => {
    return fetchApi<Subscription[]>('/insights/subscriptions');
};

export const updateSubscription = async (id: number, updates: Partial<Subscription>): Promise<Subscription> => {
    return fetchApi<Subscription>(`/insights/subscriptions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
    });
};

export const getFees = async (): Promise<any> => {
    return fetchApi('/insights/fees');
};

export const getAnomalies = async (minAmount: number = 0): Promise<any[]> => {
    return fetchApi(`/insights/anomalies?min_amount=${minAmount}`);
};

export const askData = async (question: string): Promise<AnalysisResponse> => {
    return fetchApi<AnalysisResponse>('/insights/analyze', {
        method: 'POST',
        body: JSON.stringify({ question })
    });
};
