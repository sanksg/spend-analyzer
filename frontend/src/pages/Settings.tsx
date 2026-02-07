// src/pages/Settings.tsx
import { useEffect, useState } from 'react';
import { getSettings, updateSetting } from '../api/settings';
import { AppSetting } from '../types';

export default function Settings() {
    const [settings, setSettings] = useState<AppSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await getSettings();
            setSettings(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (key: string, value: string) => {
        setLoading(true);
        try {
            await updateSetting(key, value);
            await loadSettings();
            setMsg('Saved!');
            setTimeout(() => setMsg(''), 2000);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Helper to get value for a key
    const getVal = (key: string) => settings.find(s => s.key === key)?.value || '';

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6 text-slate-800">Settings</h1>

            {loading && <div className="text-sm text-indigo-600 mb-4">Loading settings...</div>}

            <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-lg font-semibold mb-4 border-b pb-2">Financial Profile</h2>
                <div className="grid grid-cols-1 gap-6 max-w-md">

                    {/* Credit Limit Setting */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Global Credit Limit
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                className="flex-1 rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                placeholder="e.g. 500000"
                                value={getVal('credit_limit')}
                                onChange={(e) => {
                                    const next = [...settings];
                                    const idx = next.findIndex(s => s.key === 'credit_limit');
                                    if (idx >= 0) next[idx].value = e.target.value;
                                    else next.push({ key: 'credit_limit', value: e.target.value, value_type: 'int' });
                                    setSettings(next);
                                }}
                            />
                            <button
                                onClick={() => handleSave('credit_limit', getVal('credit_limit'))}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm"
                            >
                                Save
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Used to calculate credit utilization ratio.</p>
                    </div>

                    {/* APR Setting */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Annual Percentage Rate (APR %)
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                step="0.1"
                                className="flex-1 rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                                placeholder="e.g. 36.5"
                                value={getVal('apr_percentage')}
                                onChange={(e) => {
                                    const next = [...settings];
                                    const idx = next.findIndex(s => s.key === 'apr_percentage');
                                    if (idx >= 0) next[idx].value = e.target.value;
                                    else next.push({ key: 'apr_percentage', value: e.target.value, value_type: 'float' });
                                    setSettings(next);
                                }}
                            />
                            <button
                                onClick={() => handleSave('apr_percentage', getVal('apr_percentage'))}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 text-sm"
                            >
                                Save
                            </button>
                        </div>
                    </div>

                </div>
                {msg && <div className="mt-4 text-green-600 font-medium text-sm">{msg}</div>}
            </div>
        </div>
    );
}
