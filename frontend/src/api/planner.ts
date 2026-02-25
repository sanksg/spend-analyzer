import { fetchApi } from './client';
import {
    CashflowForecastResponse,
    PayoffPlanRequest,
    PayoffPlanResponse,
    RecommendationsResponse,
    SavingsGoal,
    SavingsGoalPayload,
    SavingsGoalsResponse,
    UpcomingBillsResponse,
    WeeklyActionsResponse,
} from '../types';

export const getUpcomingBills = async (days: number = 30): Promise<UpcomingBillsResponse> => {
    return fetchApi<UpcomingBillsResponse>(`/planner/upcoming-bills?days=${days}`);
};

export const getCashflowForecast = async (
    days: number = 30,
    startingCash: number = 0,
): Promise<CashflowForecastResponse> => {
    return fetchApi<CashflowForecastResponse>(
        `/planner/cashflow-forecast?days=${days}&starting_cash=${startingCash}`
    );
};

export const getPayoffPlan = async (payload: PayoffPlanRequest): Promise<PayoffPlanResponse> => {
    return fetchApi<PayoffPlanResponse>('/planner/payoff-plan', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

export const getSavingsGoals = async (): Promise<SavingsGoalsResponse> => {
    return fetchApi<SavingsGoalsResponse>('/planner/goals');
};

export const upsertSavingsGoal = async (payload: SavingsGoalPayload): Promise<SavingsGoal> => {
    return fetchApi<SavingsGoal>('/planner/goals', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
};

export const deleteSavingsGoal = async (goalId: string): Promise<void> => {
    await fetchApi(`/planner/goals/${goalId}`, { method: 'DELETE' });
};

export const getWeeklyActions = async (startingCash: number = 0): Promise<WeeklyActionsResponse> => {
    return fetchApi<WeeklyActionsResponse>(`/planner/weekly-actions?starting_cash=${startingCash}`);
};

export const getRecommendations = async (): Promise<RecommendationsResponse> => {
    return fetchApi<RecommendationsResponse>('/planner/recommendations');
};
