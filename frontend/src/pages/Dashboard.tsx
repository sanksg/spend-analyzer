import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    LayoutDashboard,
    CreditCard,
    PieChart as PieIcon,
    AlertCircle,
    Calendar,
    ArrowUpRight,
} from 'lucide-react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import { getDashboardSummary, getMerchantStats, getCategoryDrilldown } from '../api/client';
import type {
    SpendSummary,
    MerchantFrequencyItem,
    SpendByCategory,
    SpendByDay,
    CategoryDrilldown as CategoryDrilldownType,
} from '../types';
import { format, subDays, subMonths, startOfWeek, startOfYear, parseISO, differenceInDays } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../components/ui/table';

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

// ─── Types ───────────────────────────────────────────────────────────────────

type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
type PeriodKey = '30d' | '3m' | '6m' | '12m' | 'y2025' | 'y2026' | 'all' | 'custom';

interface PeriodOption {
    key: PeriodKey;
    label: string;
    getRange: () => { start: string; end: string };
    validFrequencies: Frequency[];
    defaultFrequency: Frequency;
}

const PERIOD_OPTIONS: PeriodOption[] = [
    {
        key: '30d',
        label: 'Last 30 days',
        getRange: () => ({
            start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
            end: format(new Date(), 'yyyy-MM-dd'),
        }),
        validFrequencies: ['daily', 'weekly'],
        defaultFrequency: 'daily',
    },
    {
        key: '3m',
        label: 'Last 3 months',
        getRange: () => ({
            start: format(subMonths(new Date(), 3), 'yyyy-MM-dd'),
            end: format(new Date(), 'yyyy-MM-dd'),
        }),
        validFrequencies: ['daily', 'weekly', 'monthly'],
        defaultFrequency: 'weekly',
    },
    {
        key: '6m',
        label: 'Last 6 months',
        getRange: () => ({
            start: format(subMonths(new Date(), 6), 'yyyy-MM-dd'),
            end: format(new Date(), 'yyyy-MM-dd'),
        }),
        validFrequencies: ['weekly', 'monthly'],
        defaultFrequency: 'monthly',
    },
    {
        key: '12m',
        label: 'Last 12 months',
        getRange: () => ({
            start: format(subMonths(new Date(), 12), 'yyyy-MM-dd'),
            end: format(new Date(), 'yyyy-MM-dd'),
        }),
        validFrequencies: ['weekly', 'monthly'],
        defaultFrequency: 'monthly',
    },
    {
        key: 'y2025',
        label: '2025',
        getRange: () => ({
            start: '2025-01-01',
            end: '2025-12-31',
        }),
        validFrequencies: ['weekly', 'monthly'],
        defaultFrequency: 'monthly',
    },
    {
        key: 'y2026',
        label: '2026',
        getRange: () => ({
            start: '2026-01-01',
            end: format(new Date(), 'yyyy-MM-dd'),
        }),
        validFrequencies: ['daily', 'weekly', 'monthly'],
        defaultFrequency: 'monthly',
    },
    {
        key: 'all',
        label: 'All time',
        getRange: () => ({
            start: '2020-01-01',
            end: format(new Date(), 'yyyy-MM-dd'),
        }),
        validFrequencies: ['monthly', 'yearly'],
        defaultFrequency: 'monthly',
    },
    {
        key: 'custom',
        label: 'Custom',
        getRange: () => ({
            start: format(subMonths(new Date(), 3), 'yyyy-MM-dd'),
            end: format(new Date(), 'yyyy-MM-dd'),
        }),
        validFrequencies: ['daily', 'weekly', 'monthly', 'yearly'],
        defaultFrequency: 'daily',
    },
];

function getValidFrequenciesForRange(start: string, end: string): Frequency[] {
    const days = differenceInDays(parseISO(end), parseISO(start));
    const freqs: Frequency[] = [];
    if (days <= 120) freqs.push('daily');
    if (days >= 14) freqs.push('weekly');
    if (days >= 45) freqs.push('monthly');
    if (days >= 365) freqs.push('yearly');
    return freqs.length > 0 ? freqs : ['daily'];
}

function getDefaultFrequencyForRange(start: string, end: string): Frequency {
    const days = differenceInDays(parseISO(end), parseISO(start));
    if (days <= 60) return 'daily';
    if (days <= 120) return 'weekly';
    if (days <= 730) return 'monthly';
    return 'monthly';
}

interface AggregatedBucket {
    label: string;
    total_amount: number;
}

// ─── Aggregation helpers ─────────────────────────────────────────────────────

function aggregateByFrequency(byDay: SpendByDay[], freq: Frequency): AggregatedBucket[] {
    if (freq === 'daily') {
        return byDay.map((d) => ({
            label: d.day,
            total_amount: Number(d.total_amount),
        }));
    }

    const buckets = new Map<string, number>();

    for (const d of byDay) {
        const date = parseISO(d.day);
        let key: string;

        if (freq === 'weekly') {
            const weekStart = startOfWeek(date, { weekStartsOn: 1 });
            key = format(weekStart, 'yyyy-MM-dd');
        } else if (freq === 'monthly') {
            key = format(date, 'yyyy-MM');
        } else {
            // yearly
            key = format(startOfYear(date), 'yyyy');
        }

        buckets.set(key, (buckets.get(key) || 0) + Number(d.total_amount));
    }

    return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, total]) => ({ label: key, total_amount: total }));
}

function formatBucketLabel(label: string, freq: Frequency): string {
    try {
        if (freq === 'daily') {
            return format(parseISO(label), 'd MMM');
        }
        if (freq === 'weekly') {
            return `Wk ${format(parseISO(label), 'd MMM')}`;
        }
        if (freq === 'monthly') {
            // label is 'yyyy-MM'
            const [y, m] = label.split('-');
            return format(new Date(Number(y), Number(m) - 1, 1), 'MMM yyyy');
        }
        // yearly
        return label;
    } catch {
        return label;
    }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
    // Period / date range state
    const [periodKey, setPeriodKey] = useState<PeriodKey>('30d');
    const [customStart, setCustomStart] = useState<string>(() =>
        format(subMonths(new Date(), 3), 'yyyy-MM-dd')
    );
    const [customEnd, setCustomEnd] = useState<string>(() =>
        format(new Date(), 'yyyy-MM-dd')
    );
    const [frequency, setFrequency] = useState<Frequency>('daily');

    // Data state
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<SpendSummary | null>(null);
    const [highestSpendCategory, setHighestSpendCategory] = useState<SpendByCategory | null>(null);

    // Category hierarchy (proper API drilldown)
    const [hierarchy, setHierarchy] = useState<CategoryDrilldownType[]>([]);
    const [selectedPrimary, setSelectedPrimary] = useState<string | null>(null);

    // Merchant stats
    const [merchantMetric, setMerchantMetric] = useState<'amount' | 'count'>('amount');
    const [merchantStats, setMerchantStats] = useState<MerchantFrequencyItem[]>([]);

    // Compute effective date range
    const dateRange = useMemo(() => {
        if (periodKey === 'custom') {
            return { start: customStart, end: customEnd };
        }
        const option = PERIOD_OPTIONS.find((o) => o.key === periodKey)!;
        return option.getRange();
    }, [periodKey, customStart, customEnd]);

    // Valid frequencies for current period
    const currentOption = useMemo(
        () => PERIOD_OPTIONS.find((o) => o.key === periodKey)!,
        [periodKey]
    );

    const validFrequencies = useMemo(() => {
        if (periodKey === 'custom') {
            return getValidFrequenciesForRange(customStart, customEnd);
        }
        return currentOption.validFrequencies;
    }, [periodKey, currentOption, customStart, customEnd]);

    // When period changes, auto-select the best frequency
    useEffect(() => {
        if (periodKey === 'custom') {
            const defaultFreq = getDefaultFrequencyForRange(customStart, customEnd);
            setFrequency(defaultFreq);
        } else {
            setFrequency(currentOption.defaultFrequency);
        }
    }, [periodKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // If current frequency becomes invalid due to custom range change, fix it
    useEffect(() => {
        if (!validFrequencies.includes(frequency)) {
            setFrequency(validFrequencies[0]);
        }
    }, [validFrequencies, frequency]);

    // ─── Data loading ────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const { start, end } = dateRange;

            // Parallel fetches
            const [summaryData, merchants, hierarchyData] = await Promise.all([
                getDashboardSummary(start, end),
                getMerchantStats(start, end),
                getCategoryDrilldown(start, end),
            ]);

            setSummary(summaryData);
            setMerchantStats(merchants);
            setHierarchy(hierarchyData.categories);

            // Highest spend category
            if (summaryData.by_category.length > 0) {
                const max = summaryData.by_category.reduce((prev, cur) =>
                    prev.total_amount > cur.total_amount ? prev : cur
                );
                setHighestSpendCategory(max);
            } else {
                setHighestSpendCategory(null);
            }

            // Auto-select top primary
            if (hierarchyData.categories.length > 0) {
                setSelectedPrimary(hierarchyData.categories[0].primary);
            }
        } catch (err) {
            console.error('Failed to load dashboard:', err);
            setError('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // ─── Derived chart data ──────────────────────────────────────────────────

    const trendBuckets = useMemo(() => {
        if (!summary) return [];
        return aggregateByFrequency(summary.by_day, frequency);
    }, [summary, frequency]);

    const spendingTrendData = useMemo(() => {
        if (trendBuckets.length === 0) return null;
        return {
            labels: trendBuckets.map((b) => formatBucketLabel(b.label, frequency)),
            datasets: [
                {
                    label: 'Spending',
                    data: trendBuckets.map((b) => b.total_amount),
                    borderColor: 'rgb(99, 102, 241)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    tension: 0.4,
                    fill: true,
                },
            ],
        };
    }, [trendBuckets, frequency]);

    const categoryData = useMemo(() => {
        if (!summary || summary.by_category.length === 0) return null;
        return {
            labels: summary.by_category.map((c) => normalizeCategoryDisplay(c.category_name)),
            datasets: [
                {
                    data: summary.by_category.map((c) => c.total_amount),
                    backgroundColor: CHART_PALETTE,
                    borderWidth: 0,
                },
            ],
        };
    }, [summary]);

    // Drilldown chart from proper hierarchy API
    const selectedHierarchy = useMemo(() => {
        if (!selectedPrimary) return null;
        return hierarchy.find((h) => h.primary === selectedPrimary) ?? null;
    }, [hierarchy, selectedPrimary]);

    const categoryDrilldownData = useMemo(() => {
        if (!selectedHierarchy || selectedHierarchy.detailed.length === 0) return null;
        return {
            labels: selectedHierarchy.detailed.map((d) =>
                normalizeCategoryDisplay(d.category_name)
            ),
            datasets: [
                {
                    data: selectedHierarchy.detailed.map((d) => d.total_amount),
                    backgroundColor: CHART_PALETTE,
                    borderWidth: 0,
                },
            ],
        };
    }, [selectedHierarchy]);

    // ─── Merchant charts ─────────────────────────────────────────────────────

    const sortedMerchants = useMemo(() => {
        return [...merchantStats]
            .sort((a, b) =>
                merchantMetric === 'amount'
                    ? b.total_amount - a.total_amount
                    : b.transaction_count - a.transaction_count
            )
            .slice(0, 10);
    }, [merchantStats, merchantMetric]);

    const topMerchantsData = useMemo(
        () => ({
            labels: sortedMerchants.map((m) => m.merchant),
            datasets: [
                {
                    label: merchantMetric === 'amount' ? 'Spend' : 'Transactions',
                    data: sortedMerchants.map((m) =>
                        merchantMetric === 'amount' ? m.total_amount : m.transaction_count
                    ),
                    backgroundColor: 'rgba(99, 102, 241, 0.8)',
                    borderRadius: 4,
                },
            ],
        }),
        [sortedMerchants, merchantMetric]
    );

    const loyaltyMerchants = useMemo(() => {
        return [...merchantStats]
            .sort((a, b) => {
                if (b.distinct_months !== a.distinct_months)
                    return b.distinct_months - a.distinct_months;
                return b.transaction_count - a.transaction_count;
            })
            .slice(0, 10);
    }, [merchantStats]);

    // Compute a sensible max for the repeat activity x-axis
    const maxDistinctMonths = useMemo(() => {
        if (loyaltyMerchants.length === 0) return 3;
        const m = Math.max(...loyaltyMerchants.map((l) => l.distinct_months));
        return Math.max(m + 1, 3); // at least 3
    }, [loyaltyMerchants]);

    const loyaltyChartData = useMemo(
        () => ({
            labels: loyaltyMerchants.map((m) => m.merchant),
            datasets: [
                {
                    label: 'Active Months',
                    data: loyaltyMerchants.map((m) => m.distinct_months),
                    backgroundColor: 'rgba(34, 197, 94, 0.8)',
                    borderRadius: 4,
                },
            ],
        }),
        [loyaltyMerchants]
    );

    // ─── Loading / error ─────────────────────────────────────────────────────

    if (loading && !summary) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-destructive">
                <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                <p>{error}</p>
                <Button variant="outline" onClick={() => window.location.reload()} className="mt-4">
                    Retry
                </Button>
            </div>
        );
    }

    if (!summary) return null;

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="p-6 max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header + Period controls */}
            <div className="space-y-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">
                        Overview of your spending activity and habits.
                    </p>
                </div>

                {/* Period selector — prominent pill buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    {PERIOD_OPTIONS.filter((o) => o.key !== 'custom').map((opt) => (
                        <Button
                            key={opt.key}
                            variant={periodKey === opt.key ? 'default' : 'outline'}
                            size="sm"
                            className="text-xs h-8"
                            onClick={() => setPeriodKey(opt.key)}
                        >
                            {opt.label}
                        </Button>
                    ))}
                    <Button
                        variant={periodKey === 'custom' ? 'default' : 'outline'}
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => setPeriodKey('custom')}
                    >
                        Custom
                    </Button>
                </div>

                {periodKey === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2 pl-6">
                        <Input
                            type="date"
                            className="w-[160px] h-8 text-sm"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                        />
                        <span className="text-muted-foreground text-sm">to</span>
                        <Input
                            type="date"
                            className="w-[160px] h-8 text-sm"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                        />
                    </div>
                )}
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={<CreditCard className="w-6 h-6 text-primary" />}
                    label="Total Spend"
                    value={formatCurrency(summary.total_spend)}
                    subtitle={`${summary.total_transactions} transactions`}
                />
                <StatCard
                    icon={<ArrowUpRight className="w-6 h-6 text-success" />}
                    label="Highest Spend"
                    value={
                        highestSpendCategory
                            ? formatCurrency(highestSpendCategory.total_amount)
                            : '₹0'
                    }
                    subtitle={
                        highestSpendCategory
                            ? normalizeCategoryDisplay(highestSpendCategory.category_name)
                            : '-'
                    }
                />
                <StatCard
                    icon={<PieIcon className="w-6 h-6 text-warning" />}
                    label="Top Category"
                    value={
                        highestSpendCategory
                            ? `${highestSpendCategory.percentage.toFixed(1)}%`
                            : '0%'
                    }
                    subtitle="of total spend"
                />
                <StatCard
                    icon={<LayoutDashboard className="w-6 h-6 text-primary" />}
                    label="Daily Average"
                    value={formatCurrency(
                        summary.total_spend / Math.max(summary.by_day.length, 1)
                    )}
                />
            </div>

            {/* Main Charts Row */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Spend Trend */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <CardTitle>Spending Trend</CardTitle>
                                <CardDescription>
                                    {frequency.charAt(0).toUpperCase() + frequency.slice(1)} spending
                                    over time
                                </CardDescription>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/80">
                                        Frequency
                                    </span>
                                    <div className="flex items-center gap-1 bg-muted/70 p-0.5 rounded-lg">
                                        {validFrequencies.map((f) => (
                                            <Button
                                                key={f}
                                                variant={frequency === f ? 'secondary' : 'ghost'}
                                                size="sm"
                                                className="text-xs px-2.5 h-7"
                                                onClick={() => setFrequency(f)}
                                            >
                                                {f.charAt(0).toUpperCase() + f.slice(1)}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                <p className="text-[11px] text-muted-foreground/70 text-right leading-none">
                                    Date range is selected at the top
                                </p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            {spendingTrendData ? (
                                <Line
                                    data={spendingTrendData}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { display: false },
                                            tooltip: {
                                                mode: 'index',
                                                intersect: false,
                                                callbacks: {
                                                    label: (ctx) =>
                                                        formatCurrency(ctx.raw as number),
                                                },
                                            },
                                        },
                                        scales: {
                                            x: {
                                                grid: { display: false },
                                                ticks: { maxTicksLimit: 12 },
                                            },
                                            y: {
                                                beginAtZero: true,
                                                grid: { color: 'rgba(0,0,0,0.05)' },
                                                ticks: {
                                                    callback: (value) =>
                                                        (value as number) >= 1000
                                                            ? `₹${((value as number) / 1000).toFixed(0)}k`
                                                            : `₹${value}`,
                                                },
                                            },
                                        },
                                    }}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No spending data for this period.
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Top Categories */}
                <Card>
                    <CardHeader>
                        <CardTitle>Top Categories</CardTitle>
                        <CardDescription>Distribution by volume</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] flex items-center justify-center">
                            {categoryData ? (
                                <Doughnut
                                    data={categoryData}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        cutout: '60%',
                                        plugins: {
                                            legend: {
                                                position: 'bottom',
                                                labels: {
                                                    boxWidth: 12,
                                                    padding: 15,
                                                    font: { size: 11 },
                                                    generateLabels: (chart) => {
                                                        const datasets = chart.data.datasets;
                                                        return chart.data
                                                            .labels!.slice(0, 5)
                                                            .map((label, i) => ({
                                                                text: label as string,
                                                                fillStyle: (
                                                                    datasets[0]
                                                                        .backgroundColor as string[]
                                                                )[i],
                                                                hidden: false,
                                                                index: i,
                                                            }));
                                                    },
                                                },
                                            },
                                        },
                                    }}
                                />
                            ) : (
                                <div className="text-center text-muted-foreground">
                                    No data available
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Category Drilldown */}
            <section>
                <div className="mb-4">
                    <h2 className="text-xl font-bold tracking-tight text-foreground">
                        Where does the money go?
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Deep dive into specific spending categories.
                    </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left: summary text + category list */}
                    <Card>
                        <CardContent className="p-6">
                            <p className="text-muted-foreground mb-4">
                                Your highest spending primary category is{' '}
                                <span className="font-semibold text-foreground">
                                    {selectedHierarchy
                                        ? normalizeCategoryDisplay(selectedHierarchy.primary)
                                        : '...'}
                                </span>
                                {selectedHierarchy && (
                                    <span>
                                        {' '}at{' '}
                                        <span className="font-semibold text-foreground">
                                            {formatCurrency(selectedHierarchy.total_amount)}
                                        </span>
                                        {' '}across{' '}
                                        {selectedHierarchy.transaction_count} transactions.
                                    </span>
                                )}
                            </p>

                            {/* Primary category list as clickable items */}
                            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                {hierarchy.map((h, idx) => {
                                    const isActive = selectedPrimary === h.primary;
                                    return (
                                        <button
                                            key={h.primary}
                                            onClick={() => setSelectedPrimary(h.primary)}
                                            className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive
                                                ? 'bg-primary/10 border border-primary/20'
                                                : 'hover:bg-muted border border-transparent'
                                                }`}
                                        >
                                            <div
                                                className="w-3 h-3 rounded-full flex-shrink-0"
                                                style={{
                                                    backgroundColor: getPaletteColor(idx),
                                                }}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-medium text-foreground truncate block">
                                                    {normalizeCategoryDisplay(h.primary)}
                                                </span>
                                            </div>
                                            <span className="text-sm font-semibold text-foreground">
                                                {formatCurrency(h.total_amount)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Right: drilldown donut */}
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                <h3 className="text-lg font-semibold text-foreground">
                                    Detailed breakdown
                                </h3>
                                <Select
                                    value={selectedPrimary ?? ''}
                                    onValueChange={setSelectedPrimary}
                                >
                                    <SelectTrigger className="w-[220px]">
                                        <SelectValue placeholder="Select Category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {hierarchy.map((h) => (
                                            <SelectItem key={h.primary} value={h.primary}>
                                                {normalizeCategoryDisplay(h.primary)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {categoryDrilldownData ? (
                                <div className="h-72 flex items-center justify-center">
                                    <Doughnut
                                        data={categoryDrilldownData}
                                        options={{
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            cutout: '60%',
                                            plugins: {
                                                legend: {
                                                    position: 'bottom',
                                                    align: 'start',
                                                    labels: {
                                                        boxWidth: 12,
                                                        padding: 10,
                                                        usePointStyle: true,
                                                        pointStyle: 'circle',
                                                        font: { size: 12 },
                                                    },
                                                },
                                                tooltip: {
                                                    callbacks: {
                                                        label: (ctx) => {
                                                            const val = ctx.raw as number;
                                                            const pct =
                                                                selectedHierarchy &&
                                                                    selectedHierarchy.total_amount > 0
                                                                    ? (
                                                                        (val /
                                                                            selectedHierarchy.total_amount) *
                                                                        100
                                                                    ).toFixed(1)
                                                                    : '0';
                                                            return `${formatCurrency(val)} (${pct}%)`;
                                                        },
                                                    },
                                                },
                                            },
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
                                    {hierarchy.length === 0
                                        ? 'No category data for this period.'
                                        : 'Select a category to see sub-category breakdown.'}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </section>

            {/* Merchant Loyalty & Frequency */}
            <section className="mb-10">
                <div className="mb-4">
                    <h2 className="text-xl font-bold tracking-tight text-foreground">
                        Merchant Loyalty & Frequency
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Where repeat spend shows loyalty over time.
                    </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Top merchants bar chart */}
                    <Card>
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-foreground">
                                    Top merchants
                                </h3>
                                <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg">
                                    <Button
                                        variant={
                                            merchantMetric === 'amount' ? 'secondary' : 'ghost'
                                        }
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => setMerchantMetric('amount')}
                                    >
                                        By amount
                                    </Button>
                                    <Button
                                        variant={
                                            merchantMetric === 'count' ? 'secondary' : 'ghost'
                                        }
                                        size="sm"
                                        className="text-xs h-7"
                                        onClick={() => setMerchantMetric('count')}
                                    >
                                        By frequency
                                    </Button>
                                </div>
                            </div>
                            <div className="h-64">
                                {sortedMerchants.length > 0 ? (
                                    <Bar
                                        data={topMerchantsData}
                                        options={{
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            indexAxis: 'y',
                                            plugins: { legend: { display: false } },
                                            scales: {
                                                x: {
                                                    beginAtZero: true,
                                                    grid: { color: 'rgba(0,0,0,0.05)' },
                                                    ticks: {
                                                        callback: (value) =>
                                                            merchantMetric === 'amount'
                                                                ? formatCurrency(value as number)
                                                                : `${value}`,
                                                    },
                                                },
                                                y: {
                                                    grid: { display: false },
                                                    ticks: {
                                                        font: { size: 11 },
                                                    },
                                                },
                                            },
                                        }}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                        No merchant data.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Repeat activity chart - FIXED */}
                    <Card>
                        <CardContent className="p-6">
                            <h3 className="text-lg font-semibold text-foreground mb-1">
                                Repeat activity
                            </h3>
                            <p className="text-xs text-muted-foreground mb-4">
                                Number of distinct months a merchant appears in.
                            </p>
                            <div className="h-64">
                                {loyaltyMerchants.length > 0 ? (
                                    <Bar
                                        data={loyaltyChartData}
                                        options={{
                                            responsive: true,
                                            maintainAspectRatio: false,
                                            indexAxis: 'y',
                                            plugins: { legend: { display: false } },
                                            scales: {
                                                x: {
                                                    beginAtZero: true,
                                                    max: maxDistinctMonths,
                                                    grid: { color: 'rgba(0,0,0,0.05)' },
                                                    ticks: {
                                                        stepSize: 1,
                                                        precision: 0,
                                                        callback: (value) =>
                                                            `${value} mo`,
                                                    },
                                                    title: {
                                                        display: true,
                                                        text: 'Distinct Months',
                                                        font: { size: 11 },
                                                        color: '#94a3b8',
                                                    },
                                                },
                                                y: {
                                                    grid: { display: false },
                                                    ticks: {
                                                        font: { size: 11 },
                                                    },
                                                },
                                            },
                                        }}
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                                        No repeat activity data.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Loyalty details table */}
                <Card className="overflow-hidden">
                    <CardHeader>
                        <CardTitle>Loyalty Details</CardTitle>
                    </CardHeader>
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Merchant</TableHead>
                                    <TableHead className="text-right">Transactions</TableHead>
                                    <TableHead className="text-right">Active months</TableHead>
                                    <TableHead className="text-right">Avg / month</TableHead>
                                    <TableHead className="text-right">Spend</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loyaltyMerchants.map((merchant) => (
                                    <TableRow key={merchant.merchant}>
                                        <TableCell className="font-medium">
                                            {merchant.merchant}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {merchant.transaction_count}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {merchant.distinct_months}
                                        </TableCell>
                                        <TableCell className="text-right text-muted-foreground">
                                            {merchant.average_monthly_count.toFixed(1)}
                                        </TableCell>
                                        <TableCell className="text-right font-semibold">
                                            {formatCurrency(merchant.total_amount)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            </section>

            {/* Category Breakdown Table */}
            <Card className="overflow-hidden">
                <CardHeader>
                    <CardTitle>Category Breakdown</CardTitle>
                </CardHeader>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Category</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Transactions</TableHead>
                                <TableHead className="text-right">Share</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {summary.by_category.map((cat, index) => (
                                <TableRow key={cat.category_id ?? `uncat-${index}`}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-3 h-3 rounded-full flex-shrink-0"
                                                style={{
                                                    backgroundColor: getPaletteColor(index),
                                                }}
                                            />
                                            <span className="font-medium">
                                                {normalizeCategoryDisplay(cat.category_name)}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right font-semibold">
                                        {formatCurrency(cat.total_amount)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {cat.transaction_count}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${cat.percentage}%`,
                                                        backgroundColor: getPaletteColor(index),
                                                    }}
                                                />
                                            </div>
                                            <span className="text-sm text-muted-foreground w-12 text-right">
                                                {cat.percentage.toFixed(1)}%
                                            </span>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHART_PALETTE = [
    '#6366F1',
    '#22C55E',
    '#F97316',
    '#0EA5E9',
    '#A855F7',
    '#F59E0B',
    '#14B8A6',
    '#EF4444',
    '#84CC16',
    '#64748B',
];

function StatCard({
    icon,
    label,
    value,
    subtitle,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    subtitle?: string;
}) {
    return (
        <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div className="p-2 bg-muted rounded-lg">{icon}</div>
                </div>
                <div className="mt-4">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
                    {subtitle && (
                        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function getPaletteColor(index: number): string {
    return CHART_PALETTE[index % CHART_PALETTE.length];
}

function normalizeCategoryDisplay(name: string): string {
    if (!name) return 'Uncategorized';
    const cleaned = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(/\s*[:>\-]\s*/).filter(Boolean);
    if (parts.length >= 2) {
        return `${toTitleCase(parts[0])} - ${toTitleCase(parts.slice(1).join(' '))}`;
    }
    return toTitleCase(cleaned);
}

function toTitleCase(value: string): string {
    return value
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
