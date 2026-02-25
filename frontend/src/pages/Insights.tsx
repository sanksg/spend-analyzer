import { useEffect, useState } from 'react';
import { getSubscriptions, scanSubscriptions, getFees, getAnomalies, updateSubscription } from '../api/insights';
import { getBudgetStatus, getTriggers, getSubscriptionSummary } from '../api/budgets';
import { Subscription, BudgetStatusItem, BudgetStatusResponse, Trigger, SubscriptionSummary } from '../types';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';
import { ChevronRight } from 'lucide-react';

// Icons
const RefreshIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
);

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
);

const XMarkIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
);

const AlertIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-warning">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
);

export default function Insights() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Insights Dashboard</h1>
                <p className="text-muted-foreground mt-1">Behavioral patterns, recurring charges, and anomalies from your spending data.</p>
            </div>

            {/* Budget Status */}
            <BudgetStatusPanel />

            {/* Top Cards Row */}
            <FeesSummaryCard />

            {/* Collapsible Sections (uniform) */}
            <div className="space-y-6">
                <TriggersPanel />
                <SubscriptionPanel />
                <AnomalyPanel />
            </div>
        </div>
    );
}

// ─── Budget Status ───────────────────────────────────────────────────────────

function BudgetStatusPanel() {
    const [status, setStatus] = useState<BudgetStatusResponse | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getBudgetStatus()
            .then(setStatus)
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) return null;
    if (!status || status.items.length === 0) {
        return (
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-2">Budget Status</h2>
                <p className="text-sm text-muted-foreground">
                    No budgets configured. Go to <a href="/settings" className="text-primary underline">Settings</a> to add monthly budgets.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                    Budget Status &mdash; {status.month}
                </h2>
            </div>
            <div className="space-y-4">
                {status.items.map((item) => (
                    <BudgetBar key={item.budget_id} item={item} />
                ))}
            </div>
        </div>
    );
}

function BudgetBar({ item }: { item: BudgetStatusItem }) {
    const pct = Math.min(item.percent, 150);
    const barColor =
        item.percent >= 120
            ? 'bg-destructive'
            : item.percent >= 100
                ? 'bg-warning'
                : item.percent >= 80
                    ? 'bg-warning/80'
                    : 'bg-success';

    return (
        <div>
            <div className="flex justify-between items-baseline mb-1">
                <div className="flex items-center gap-2">
                    {item.category_color && (
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.category_color }} />
                    )}
                    <span className="text-sm font-medium text-muted-foreground">
                        {item.scope === 'total' ? 'Total Spending' : item.category_name || 'Unknown'}
                    </span>
                </div>
                <div className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">₹{Number(item.spent).toLocaleString()}</span>
                    {' / '}
                    ₹{Number(item.monthly_limit).toLocaleString()}
                    <span className={`ml-2 text-xs font-semibold ${item.percent >= 100 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {item.percent.toFixed(0)}%
                    </span>
                </div>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(pct / 1.5 * 100 / 100, 100)}%` }}
                />
            </div>
            {item.thresholds_crossed.length > 0 && item.thresholds_crossed.includes(100) && (
                <p className="text-xs text-destructive mt-1 font-medium">
                    Over budget{item.thresholds_crossed.includes(120) ? ' — significantly exceeded!' : '.'}
                </p>
            )}
        </div>
    );
}

// ─── Smart Alerts / Triggers ──────────────────────────────────────────────────

function TriggersPanel() {
    const [triggers, setTriggers] = useState<Trigger[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(true);

    useEffect(() => {
        getTriggers()
            .then((data) => {
                setTriggers(data);
                setOpen(data.length > 0);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) return null;

    const sevColor: Record<string, string> = {
        alert: 'bg-destructive/10 text-destructive border-destructive/30',
        warning: 'bg-warning/10 text-warning border-warning/30',
        info: 'bg-primary/10 text-primary border-primary/30',
    };

    const sevIcon: Record<string, string> = {
        alert: '🔴',
        warning: '🟡',
        info: '🔵',
    };

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden flex flex-col">
                <div className="p-5 border-b border-border/60 bg-muted/50">
                    <div className="flex items-start justify-between gap-4">
                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                className="group flex items-start gap-2 text-left"
                                title={open ? 'Collapse' : 'Expand'}
                            >
                                <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-warning">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                                        </svg>
                                        Smart Alerts
                                    </h2>
                                    <p className="text-xs text-muted-foreground">Behavioral patterns detected this month</p>
                                </div>
                            </button>
                        </CollapsibleTrigger>
                        <div className="text-xs text-muted-foreground pt-1">
                            {triggers.length} item{triggers.length === 1 ? '' : 's'}
                        </div>
                    </div>
                </div>

                <CollapsibleContent>
                    <div className="flex-1 overflow-y-auto max-h-[400px]">
                        {triggers.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                                <p className="text-success font-medium">All clear!</p>
                                <p className="text-xs mt-1">No unusual spending patterns detected.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border">
                                {triggers.map((t, i) => (
                                    <div key={i} className={`p-4 border-l-4 ${sevColor[t.severity] || ''}`}>
                                        <div className="flex items-start gap-2">
                                            <span className="text-sm">{sevIcon[t.severity]}</span>
                                            <div className="flex-1">
                                                <div className="font-medium text-sm text-foreground">{t.title}</div>
                                                <p className="text-xs text-muted-foreground mt-0.5">{t.reason}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}

// ─── Fees ─────────────────────────────────────────────────────────────────────

function FeesSummaryCard() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        getFees()
            .then(setStats)
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) return null;

    if (!stats || stats.count === 0) {
        return (
            <div className="bg-card rounded-xl shadow-sm border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-destructive">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    Fees & Taxes Analysis
                </h2>
                <p className="text-sm text-muted-foreground">No fee or tax transactions detected in your statements.</p>
            </div>
        );
    }

    return (
        <div className="bg-card rounded-xl shadow-sm border border-border p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-destructive">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    Fees & Taxes Analysis
                </h2>
                {stats.transactions.length > 0 && (
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="text-sm font-medium text-primary hover:text-primary/80 transition"
                    >
                        {showAll ? 'Hide Transactions' : 'View All'}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-destructive/10 rounded-lg p-4">
                    <p className="text-sm text-destructive mb-1">Total Fees & Taxes</p>
                    <p className="text-2xl font-bold text-destructive">₹{stats.total.toLocaleString()}</p>
                </div>
                {Object.entries(stats.breakdown || {}).map(([key, val]: [string, any]) => (
                    <div key={key} className="border border-border/60 rounded-lg p-4">
                        <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">{key}</p>
                        <p className="text-lg font-semibold text-foreground">₹{val.toLocaleString()}</p>
                    </div>
                ))}
            </div>

            {/* Collapsible Transaction List */}
            {showAll && stats.transactions.length > 0 && (
                <div className="mt-6 border-t border-border/60 pt-4 animate-in slide-in-from-top-2 duration-200">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Fee Transactions</h3>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-lg border border-border">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 border-b">Date</th>
                                    <th className="px-4 py-2 border-b">Description</th>
                                    <th className="px-4 py-2 border-b text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border bg-card">
                                {stats.transactions.map((t: any) => (
                                    <tr key={t.id} className="hover:bg-muted/50">
                                        <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{t.date}</td>
                                        <td className="px-4 py-2 font-medium text-foreground">{t.description}</td>
                                        <td className="px-4 py-2 text-right font-medium text-destructive">₹{t.amount.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Recent Preview (hidden when showAll is true) */}
            {!showAll && stats.transactions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border/60">
                    <p className="text-xs text-muted-foreground mb-2">Recent Charges:</p>
                    <div className="flex flex-wrap gap-2">
                        {stats.transactions.slice(0, 5).map((t: any) => (
                            <span key={t.id} className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground truncate max-w-[200px]" title={t.description}>
                                {t.date}: ₹{t.amount}
                            </span>
                        ))}
                        {stats.transactions.length > 5 && (
                            <button onClick={() => setShowAll(true)} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary/20 transition">
                                +{stats.transactions.length - 5} more
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function SubscriptionPanel() {
    const [subs, setSubs] = useState<Subscription[]>([]);
    const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [bulkUpdating, setBulkUpdating] = useState(false);
    const [open, setOpen] = useState(true);
    const [filter, setFilter] = useState<
        'all' | 'subscription' | 'installment' | 'possible_installment'
    >('all');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);

    const load = async () => {
        const [data, summ] = await Promise.all([getSubscriptions(), getSubscriptionSummary()]);
        setSubs(data);
        setSummary(summ);
    };

    const handleScan = async () => {
        setLoading(true);
        try {
            await scanSubscriptions();
            await load();
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (id: number, updates: Partial<Subscription>) => {
        // Optimistic update
        const original = subs.find(s => s.id === id);
        if (!original) return;

        setSubs(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));

        try {
            await updateSubscription(id, updates);
            // Reload to ensure summary totals are consistent
            await load();
        } catch (err) {
            console.error("Failed to update subscription", err);
            // Revert
            setSubs(prev => prev.map(s => s.id === id ? original : s));
        }
    };

    const filtered = filter === 'all'
        ? subs.filter(s => s.active) // Only show active by default
        : subs.filter(s => s.active && (s.kind || 'subscription') === filter);

    const visiblePossible = filtered.filter(s => s.kind === 'possible_installment');
    const selectedSet = new Set(selectedIds);
    const allVisibleSelected = visiblePossible.length > 0 && visiblePossible.every(s => selectedSet.has(s.id));

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleSelectAllVisible = () => {
        setSelectedIds(prev => {
            const prevSet = new Set(prev);
            if (allVisibleSelected) {
                // Unselect all visible possible
                return prev.filter(id => !visiblePossible.some(s => s.id === id));
            }
            // Select all visible possible
            for (const s of visiblePossible) prevSet.add(s.id);
            return Array.from(prevSet);
        });
    };

    const handleBulkUpdate = async (updates: Partial<Subscription>) => {
        const ids = visiblePossible.map(s => s.id).filter(id => selectedSet.has(id));
        if (ids.length === 0) return;

        setBulkUpdating(true);
        try {
            await Promise.all(ids.map(id => updateSubscription(id, updates)));
            setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
            await load();
        } catch (err) {
            console.error('Bulk update failed', err);
            await load();
        } finally {
            setBulkUpdating(false);
        }
    };

    useEffect(() => { load(); }, []);

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden flex flex-col">
                <div className="p-5 border-b border-border/60 bg-muted/50">
                    <div className="flex justify-between items-start gap-4">
                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                className="group flex items-start gap-2 text-left"
                                title={open ? 'Collapse' : 'Expand'}
                            >
                                <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                                <div>
                                    <h2 className="text-lg font-semibold text-foreground">Recurring Charges & EMIs</h2>
                                    {summary && (
                                        <div className="flex flex-wrap gap-4 mt-1 text-xs text-muted-foreground">
                                            <span>Subs: <span className="font-bold text-foreground">₹{summary.subscription_monthly.toLocaleString()}/mo</span></span>
                                            <span>EMIs: <span className="font-bold text-foreground">₹{summary.emi_monthly.toLocaleString()}/mo</span></span>
                                            <span>Possible EMI: <span className="font-bold text-foreground">₹{summary.possible_emi_monthly.toLocaleString()}/mo</span></span>
                                            <span>Total: <span className="font-bold text-primary">₹{summary.total_monthly_committed.toLocaleString()}/mo</span></span>
                                        </div>
                                    )}
                                </div>
                            </button>
                        </CollapsibleTrigger>

                        <Button
                            onClick={handleScan}
                            disabled={loading}
                            variant="ghost"
                            size="icon-sm"
                            className="text-primary hover:bg-muted rounded-full"
                            title="Rescan"
                        >
                            <RefreshIcon />
                        </Button>
                    </div>

                    {/* Filter Toggle */}
                    <CollapsibleContent>
                        <div className="flex gap-1 mt-3">
                            {(['all', 'subscription', 'installment', 'possible_installment'] as const).map(f => (
                                <Button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    variant={filter === f ? 'default' : 'outline'}
                                    size="xs"
                                    className={`rounded-full ${filter === f ? 'bg-primary hover:bg-primary/90' : 'text-muted-foreground border-border'}`}
                                >
                                    {f === 'all'
                                        ? 'All'
                                        : f === 'subscription'
                                            ? 'Subscriptions'
                                            : f === 'installment'
                                                ? 'EMIs'
                                                : 'Possible EMI'}
                                </Button>
                            ))}
                        </div>
                    </CollapsibleContent>
                </div>

                <CollapsibleContent>
                    <div className="flex-1 overflow-y-auto max-h-[500px] p-0">
                        {filtered.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                                <p>No {filter === 'all'
                                    ? 'recurring'
                                    : filter === 'subscription'
                                        ? 'subscriptions'
                                        : filter === 'installment'
                                            ? 'EMIs'
                                            : 'possible EMIs'} detected yet.</p>
                                <p className="text-sm mt-2">Click refresh to scan your transactions.</p>
                            </div>
                        ) : (
                            <div>
                                {filter === 'possible_installment' && (
                                    <div className="px-6 py-3 border-b border-border/60 bg-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <label className="flex items-center gap-2 text-xs text-muted-foreground select-none cursor-pointer">
                                            <Checkbox
                                                checked={allVisibleSelected}
                                                onCheckedChange={toggleSelectAllVisible}
                                            />
                                            Select all
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                disabled={bulkUpdating || selectedIds.length === 0}
                                                onClick={() => handleBulkUpdate({ kind: 'installment', user_confirmed: true })}
                                                variant="outline-success"
                                                size="sm"
                                                title="Confirm selected as EMI"
                                            >
                                                Confirm selected
                                            </Button>
                                            <Button
                                                disabled={bulkUpdating || selectedIds.length === 0}
                                                onClick={() => handleBulkUpdate({ active: false })}
                                                variant="outline-danger"
                                                size="sm"
                                                title="Dismiss selected (Not an EMI)"
                                            >
                                                Dismiss selected
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                <table className="w-full text-sm text-left table-fixed">
                                    <thead className="text-xs text-muted-foreground uppercase bg-card sticky top-0 z-10 border-b border-border">
                                        <tr>
                                            <th className="px-6 py-3">Merchant</th>
                                            <th className="px-6 py-3 w-36">Amount</th>
                                            <th className="px-6 py-3 w-32">Type</th>
                                            <th className="px-6 py-3 w-28">Last Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.map((sub) => (
                                            <tr key={sub.id} className="border-b border-border hover:bg-muted/50 align-top">
                                                <td className="px-6 py-4 font-medium text-foreground">
                                                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                                                        <div className="min-w-0 flex items-start gap-2">
                                                            {filter === 'possible_installment' && sub.kind === 'possible_installment' && (
                                                                <div className="pt-0.5">
                                                                    <Checkbox
                                                                        checked={selectedSet.has(sub.id)}
                                                                        onCheckedChange={() => toggleSelect(sub.id)}
                                                                    />
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <div className="whitespace-normal break-words">
                                                                    {sub.merchant || sub.merchant_normalized}
                                                                </div>
                                                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                                                    {sub.kind === 'installment' && (
                                                                        <Badge variant="warning">EMI</Badge>
                                                                    )}
                                                                    {sub.kind === 'possible_installment' && (
                                                                        <Badge variant="warning" className="bg-warning/15 text-warning">Possible EMI</Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {sub.kind === 'possible_installment' && (
                                                            <div className="flex gap-2 flex-shrink-0">
                                                                <Button
                                                                    onClick={() => handleUpdate(sub.id, { kind: 'installment', user_confirmed: true })}
                                                                    variant="outline-success"
                                                                    size="icon-xs"
                                                                    title="Confirm as EMI"
                                                                >
                                                                    <CheckIcon />
                                                                </Button>
                                                                <Button
                                                                    onClick={() => handleUpdate(sub.id, { active: false })}
                                                                    variant="outline-danger"
                                                                    size="icon-xs"
                                                                    title="Dismiss (Not an EMI)"
                                                                >
                                                                    <XMarkIcon />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">₹{Number(sub.amount).toLocaleString()}</td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <Badge
                                                        variant={sub.cadence === 'Monthly' ? 'secondary' : 'outline'}
                                                        className={sub.cadence === 'Monthly' ? 'bg-primary/15 text-primary hover:bg-primary/25' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}
                                                    >
                                                        {sub.cadence}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">{sub.last_seen}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}

function AnomalyPanel() {
    const [anomalies, setAnomalies] = useState<any[]>([]);
    const [minAmount, setMinAmount] = useState(1000);
    const [open, setOpen] = useState(true);

    const load = async () => {
        const data = await getAnomalies(minAmount);
        setAnomalies(data);
    };

    useEffect(() => { load(); }, [minAmount]);

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden flex flex-col">
                <div className="p-5 border-b border-border/60 flex justify-between items-center bg-muted/50">
                    <CollapsibleTrigger asChild>
                        <button type="button" className="group flex items-start gap-2 text-left" title={open ? 'Collapse' : 'Expand'}>
                            <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                            <div>
                                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                                    <AlertIcon /> Anomalies
                                </h2>
                                <p className="text-xs text-muted-foreground">Unusual spending deviations</p>
                            </div>
                        </button>
                    </CollapsibleTrigger>
                    <select
                        className="text-xs border border-input bg-background rounded p-1"
                        value={minAmount}
                        onChange={(e) => setMinAmount(Number(e.target.value))}
                    >
                        <option value={0}>All Amounts</option>
                        <option value={1000}>&gt; ₹1,000</option>
                        <option value={5000}>&gt; ₹5,000</option>
                        <option value={10000}>&gt; ₹10,000</option>
                    </select>
                </div>

                <CollapsibleContent>
                    <div className="flex-1 overflow-y-auto max-h-[500px]">
                        {anomalies.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                                <div className="flex justify-center mb-2 text-success">
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                    </svg>
                                </div>
                                <p>No anomalies detected.</p>
                                <p className="text-xs mt-1">Spending matches historical patterns.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-border">
                                {anomalies.map((item, i) => (
                                    <div key={i} className="p-4 hover:bg-muted/50 transition">
                                        <div className="flex justify-between items-start mb-1">
                                            <div className="font-medium text-foreground">{item.merchant}</div>
                                            <div className="font-bold text-destructive">₹{item.amount.toLocaleString()}</div>
                                        </div>
                                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                                            <span>{item.date} • {item.category}</span>
                                            <span className="bg-destructive/10 text-destructive px-2 py-0.5 rounded">
                                                {item.severity}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}
