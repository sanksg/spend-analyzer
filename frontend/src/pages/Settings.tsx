// src/pages/Settings.tsx
import { useEffect, useState } from 'react';
import { getSettings, updateSetting } from '../api/settings';
import { getBudgets, createOrUpdateBudget, deleteBudget } from '../api/budgets';
import { getCategories } from '../api/client';
import { AppSetting, Budget, Category } from '../types';
import { Trash2, CheckCircle, Plus } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import { Badge } from '../components/ui/badge';

export default function Settings() {
    const [settings, setSettings] = useState<AppSetting[]>([]);
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
        }
    };

    const handleSave = async (key: string, value: string) => {
        try {
            await updateSetting(key, value);
            await loadSettings();
            setMsg('Saved!');
            setTimeout(() => setMsg(''), 2000);
        } catch (err) {
            console.error(err);
        }
    };

    const getVal = (key: string) => settings.find(s => s.key === key)?.value || '';

    return (
        <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
                <p className="text-muted-foreground mt-1">
                    Manage your preferences and budget limits.
                </p>
            </div>

            {/* Financial Profile */}
            <Card>
                <CardHeader>
                    <CardTitle>Financial Profile</CardTitle>
                    <CardDescription>
                        Set your global parameters for calculating utilization and interest.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-4 max-w-xl">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Global Credit Limit (₹)
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    type="number"
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
                                <Button
                                    onClick={() => handleSave('credit_limit', getVal('credit_limit'))}
                                >
                                    Save
                                </Button>
                            </div>
                            <p className="text-[0.8rem] text-muted-foreground">
                                Used to calculate credit utilization ratio.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Annual Percentage Rate (APR %)
                            </label>
                            <div className="flex gap-2">
                                <Input
                                    type="number"
                                    step="0.1"
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
                                <Button
                                    onClick={() => handleSave('apr_percentage', getVal('apr_percentage'))}
                                >
                                    Save
                                </Button>
                            </div>
                        </div>
                    </div>
                    {msg && (
                        <div className="flex items-center gap-2 text-sm text-success animate-in fade-in">
                            <CheckCircle className="w-4 h-4" />
                            {msg}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Budgets */}
            <BudgetsSection />
        </div>
    );
}

function BudgetsSection() {
    const [budgets, setBudgets] = useState<Budget[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [newScope, setNewScope] = useState<'total' | 'category'>('category');
    const [newCatId, setNewCatId] = useState<string>('');
    const [newLimit, setNewLimit] = useState('');
    const [saving, setSaving] = useState(false);

    const load = async () => {
        try {
            const [b, c] = await Promise.all([getBudgets(), getCategories()]);
            setBudgets(b);
            setCategories(c.categories);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleAdd = async () => {
        if (!newLimit || Number(newLimit) <= 0) return;
        setSaving(true);
        try {
            await createOrUpdateBudget(
                newScope,
                Number(newLimit),
                newScope === 'category' && newCatId ? Number(newCatId) : null
            );
            setShowAdd(false);
            setNewLimit('');
            setNewCatId('');
            await load();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        await deleteBudget(id);
        await load();
    };

    const hasTotalBudget = budgets.some(b => b.scope === 'total');

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>Monthly Budgets</CardTitle>
                    <CardDescription>
                        Set spending limits to get alerts.
                    </CardDescription>
                </div>
                <Button variant={showAdd ? "secondary" : "default"} size="sm" onClick={() => setShowAdd(!showAdd)}>
                    {showAdd ? 'Cancel' : (
                        <>
                            <Plus className="w-4 h-4 mr-1" />
                            Add Budget
                        </>
                    )}
                </Button>
            </CardHeader>
            <CardContent>
                {/* Add Budget Form */}
                {showAdd && (
                    <div className="bg-muted/50 rounded-lg p-4 mb-4 space-y-4 border border-border animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                            <div className="space-y-2">
                                <label className="text-xs font-medium leading-none">Scope</label>
                                <Select
                                    value={newScope}
                                    onValueChange={(val: 'total' | 'category') => setNewScope(val)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {!hasTotalBudget && <SelectItem value="total">Total Spending</SelectItem>}
                                        <SelectItem value="category">Category</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            {newScope === 'category' && (
                                <div className="space-y-2 md:col-span-1">
                                    <label className="text-xs font-medium leading-none">Category</label>
                                    <Select
                                        value={newCatId}
                                        onValueChange={setNewCatId}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories.map(c => (
                                                <SelectItem key={c.id} value={c.id.toString()}>
                                                    {c.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            <div className="space-y-2">
                                <label className="text-xs font-medium leading-none">Monthly Limit (₹)</label>
                                <Input
                                    type="number"
                                    placeholder="e.g. 10000"
                                    value={newLimit}
                                    onChange={(e) => setNewLimit(e.target.value)}
                                />
                            </div>
                            <div className="flex">
                                <Button
                                    onClick={handleAdd}
                                    disabled={saving || !newLimit || (newScope === 'category' && !newCatId)}
                                    className="w-full"
                                >
                                    {saving ? 'Saving...' : 'Save'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Budget List */}
                {loading ? (
                    <div className="text-sm text-muted-foreground py-4">Loading budgets...</div>
                ) : budgets.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center border-dashed border rounded-lg">
                        No budgets configured. Add a total or per-category monthly budget to track spending.
                    </div>
                ) : (
                    <div className="divide-y divide-border rounded-md border text-sm">
                        {budgets.map(b => (
                            <div key={b.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-3">
                                    {b.category_color && (
                                        <div
                                            className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: b.category_color }}
                                        />
                                    )}
                                    <span className="font-medium text-foreground">
                                        {b.scope === 'total' ? 'Total Monthly Spending' : b.category_name || 'Unknown Category'}
                                    </span>
                                    {b.scope === 'total' && (
                                        <Badge variant="outline" className="text-[10px] h-5">Global</Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="font-semibold text-foreground">
                                        ₹{Number(b.monthly_limit).toLocaleString()}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDelete(b.id)}
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        title="Remove budget"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
