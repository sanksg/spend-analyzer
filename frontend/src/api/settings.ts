// src/api/settings.ts
import { fetchApi } from './client';
import { AppSetting } from '../types';

export const getSettings = async (): Promise<AppSetting[]> => {
    return fetchApi<AppSetting[]>('/settings/');
};

export const updateSetting = async (key: string, value: string, value_type: string = 'string'): Promise<AppSetting> => {
    return fetchApi<AppSetting>('/settings/', {
        method: 'POST',
        body: JSON.stringify({ key, value, value_type }),
    });
};
