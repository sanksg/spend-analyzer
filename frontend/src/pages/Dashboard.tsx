import { useEffect, useMemo, useCallback, useState } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    PointElement,
    LineElement,
    Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { TrendingUp, Receipt, CreditCard, Calendar } from 'lucide-react';
import { getSpendSummary, getTimePatterns, getCategoryHierarchy, getMerchantFrequency } from '../api/client';
import type {
    SpendSummary,
    TimePatternsResponse,
    CategoryHierarchyResponse,
    MerchantFrequencyResponse,
} from '../types';
import { format, startOfYear, subDays, subMonths } from 'date-fns';

// Register Chart.js components
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    PointElement,
    LineElement,
    Filler
);

export default function Dashboard() {
    const [summary, setSummary] = useState<SpendSummary | null>(null);
    const [timePatterns, setTimePatterns] = useState<TimePatternsResponse | null>(null);
    const [categoryHierarchy, setCategoryHierarchy] = useState<CategoryHierarchyResponse | null>(null);
    const [merchantFrequency, setMerchantFrequency] = useState<MerchantFrequencyResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [timeframe, setTimeframe] = useState<'30d' | '90d' | '6m' | '12m' | 'ytd' | 'all'>('90d');
    const [trendGranularity, setTrendGranularity] = useState<'monthly' | 'daily'>('monthly');
    const [merchantMetric, setMerchantMetric] = useState<'amount' | 'count'>('amount');
    const [selectedPrimary, setSelectedPrimary] = useState<string | null>(null);

    const dateRange = useMemo(() => {
        const now = new Date();
        switch (timeframe) {
            case '30d':
                return { start_date: format(subDays(now, 30), 'yyyy-MM-dd'), end_date: format(now, 'yyyy-MM-dd') };
            case '90d':
                return { start_date: format(subDays(now, 90), 'yyyy-MM-dd'), end_date: format(now, 'yyyy-MM-dd') };
            case '6m':
                return { start_date: format(subMonths(now, 6), 'yyyy-MM-dd'), end_date: format(now, 'yyyy-MM-dd') };
            case '12m':
                return { start_date: format(subMonths(now, 12), 'yyyy-MM-dd'), end_date: format(now, 'yyyy-MM-dd') };
            case 'ytd':
                return { start_date: format(startOfYear(now), 'yyyy-MM-dd'), end_date: format(now, 'yyyy-MM-dd') };
            case 'all':
            default:
                return { start_date: undefined, end_date: undefined };
        }
    }, [timeframe]);

    const periodLabel = useMemo(() => {
        switch (timeframe) {
            case '30d':
                return 'Last 30 days';
            case '90d':
                return 'Last 90 days';
            case '6m':
                return 'Last 6 months';
            case '12m':
                return 'Last 12 months';
            case 'ytd':
                return 'Year to date';
            case 'all':
            default:
                return 'All time';
        }
    }, [timeframe]);

    const loadSummary = useCallback(async () => {
        try {
            setLoading(true);
            const [summaryData, patternsData, hierarchyData, merchantData] = await Promise.all([
                getSpendSummary({
                    start_date: dateRange.start_date,
                    end_date: dateRange.end_date,
                }),
                getTimePatterns({
                    start_date: dateRange.start_date,
                    end_date: dateRange.end_date,
                }),
                getCategoryHierarchy({
                    start_date: dateRange.start_date,
                    end_date: dateRange.end_date,
                }),
                getMerchantFrequency({
                    start_date: dateRange.start_date,
                    end_date: dateRange.end_date,
                }),
            ]);
            setSummary(summaryData);
            setTimePatterns(patternsData);
            setCategoryHierarchy(hierarchyData);
            setMerchantFrequency(merchantData);
            if (hierarchyData.categories.length > 0) {
                setSelectedPrimary((current) => current ?? hierarchyData.categories[0].primary);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load summary');
        } finally {
            setLoading(false);
        }
    }, [dateRange.end_date, dateRange.start_date]);

    useEffect(() => {
        loadSummary();
    }, [loadSummary]);



    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8">
                <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20">{error}</div>
            </div>
        );
    }

    if (!summary || summary.total_transactions === 0) {
        return (
            <div className="p-6 lg:p-8">
                <h1 className="text-2xl font-semibold text-foreground mb-6">Dashboard</h1>
                <div className="bg-card border-2 border-dashed border-border rounded-xl p-12 text-center">
                    <Receipt className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                        No transactions yet
                    </h3>
                    <p className="text-muted-foreground">
                        Upload a credit card statement to get started with spending analysis.
                    </p>
                </div>
            </div>
        );
    }

    const periodRangeText = summary.date_range_start && summary.date_range_end
        ? `${format(new Date(summary.date_range_start), 'MMM d, yyyy')} - ${format(
            new Date(summary.date_range_end),
            'MMM d, yyyy'
        )}`
        : 'All available data';

    // Prepare chart data
    const primaryCategories = categoryHierarchy?.categories ?? [];
    const selectedPrimaryData = primaryCategories.find((item) => item.primary === selectedPrimary) ?? null;

    const categoryChartData = {
        labels: primaryCategories.map((c) => normalizeCategoryLabel(c.primary)),
        datasets: [
            {
                data: primaryCategories.map((c) => c.total_amount),
                backgroundColor: primaryCategories.map((_, index) => getPaletteColor(index)),
                borderWidth: 0,
                hoverOffset: 4,
            },
        ],
    };

    const categoryDrilldownData = selectedPrimaryData
        ? {
              labels: selectedPrimaryData.detailed.map((d) =>
                  normalizeCategoryLabel(d.category_name, selectedPrimaryData.primary)
              ),
              datasets: [
                  {
                      data: selectedPrimaryData.detailed.map((d) => d.total_amount),
                      backgroundColor: selectedPrimaryData.detailed.map((_, index) => getPaletteColor(index)),
                      borderWidth: 0,
                      hoverOffset: 4,
                  },
              ],
          }
        : null;

    const trendChartData = trendGranularity === 'monthly'
        ? {
            labels: summary.by_month.map((m) => format(new Date(`${m.month}-01`), 'MMM yyyy')),
            datasets: [
                {
                    label: 'Spending',
                    data: summary.by_month.map((m) => m.total_amount),
                    borderColor: getPaletteColor(0),
                    backgroundColor: withAlpha(getPaletteColor(0), 0.12),
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: getPaletteColor(0),
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                },
            ],
        }
        : {
            labels: summary.by_day.map((d) => format(new Date(d.day), 'MMM d')),
            datasets: [
                {
                    label: 'Spending',
                    data: summary.by_day.map((d) => d.total_amount),
                    borderColor: getPaletteColor(0),
                    backgroundColor: withAlpha(getPaletteColor(0), 0.12),
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: getPaletteColor(0),
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                },
            ],
        };

    const topMerchants = [...summary.top_merchants].sort((a, b) => {
        if (merchantMetric === 'amount') {
            return b.total_amount - a.total_amount;
        }
        return b.transaction_count - a.transaction_count;
    });

    const loyaltyMerchants = merchantFrequency?.merchants ?? [];
    const loyaltyChartData = {
        labels: loyaltyMerchants.slice(0, 8).map((m) => m.merchant),
        datasets: [
            {
                label: 'Transactions',
                data: loyaltyMerchants.slice(0, 8).map((m) => m.transaction_count),
                backgroundColor: loyaltyMerchants.slice(0, 8).map((_, index) => getPaletteColor(index)),
                borderRadius: 6,
            },
        ],
    };

    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dayOfWeekData = {
        labels: dayLabels,
        datasets: [
            {
                label: 'Spend',
                data: timePatterns?.by_day_of_week.map((d) => d.total_amount) ?? [],
                backgroundColor: dayLabels.map((_, index) => getPaletteColor(index)),
                borderRadius: 6,
            },
        ],
    };

    const monthTotals = summary.by_month.map((month) => month.total_amount);
    const lastMonthTotal = monthTotals[monthTotals.length - 1] ?? 0;
    const previousMonthTotal = monthTotals[monthTotals.length - 2] ?? 0;
    const momChange = previousMonthTotal > 0 ? (lastMonthTotal - previousMonthTotal) / previousMonthTotal : 0;

    const monthIndex = new Map(summary.by_month.map((month) => [month.month, month.total_amount]));
    const lastMonthKey = summary.by_month[summary.by_month.length - 1]?.month;
    const lastMonthDate = lastMonthKey ? new Date(`${lastMonthKey}-01`) : null;
    const lastYearKey = lastMonthDate
        ? format(new Date(lastMonthDate.getFullYear() - 1, lastMonthDate.getMonth(), 1), 'yyyy-MM')
        : null;
    const lastYearTotal = lastYearKey ? monthIndex.get(lastYearKey) ?? 0 : 0;
    const yoyChange = lastYearTotal > 0 ? (lastMonthTotal - lastYearTotal) / lastYearTotal : 0;

    const topMerchantsData = {
        labels: topMerchants.slice(0, 8).map((m) => m.merchant),
        datasets: [
            {
                label: merchantMetric === 'amount' ? 'Amount' : 'Transactions',
                data:
                    merchantMetric === 'amount'
                        ? topMerchants.slice(0, 8).map((m) => m.total_amount)
                        : topMerchants.slice(0, 8).map((m) => m.transaction_count),
                backgroundColor: topMerchants.slice(0, 8).map((_, index) => getPaletteColor(index)),
                borderRadius: 6,
            },
        ],
    };

    return (
        <div className="p-6 lg:p-8 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Period: {periodLabel} • {periodRangeText}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={timeframe}
                        onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
                        className="select min-w-[180px]"
                    >
                        <option value="30d">Last 30 days</option>
                        <option value="90d">Last 90 days</option>
                        <option value="6m">Last 6 months</option>
                        <option value="12m">Last 12 months</option>
                        <option value="ytd">Year to date</option>
                        <option value="all">All time</option>
                    </select>
                </div>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                    icon={<CreditCard className="w-5 h-5" />}
                    label="Total Spend"
                    value={formatCurrency(summary.total_spend)}
                    subtitle={`Period: ${periodLabel}`}
                />
                <StatCard
                    icon={<Receipt className="w-5 h-5" />}
                    label="Transactions"
                    value={summary.total_transactions.toString()}
                    subtitle={`Period: ${periodLabel}`}
                />
                <StatCard
                    icon={<TrendingUp className="w-5 h-5" />}
                    label="Average Transaction"
                    value={formatCurrency(summary.average_transaction)}
                    subtitle={`Period: ${periodLabel}`}
                />
                <StatCard
                    icon={<Calendar className="w-5 h-5" />}
                    label="Date Range"
                    value={
                        summary.date_range_start && summary.date_range_end
                            ? `${format(new Date(summary.date_range_start), 'MMM d')} - ${format(
                                new Date(summary.date_range_end),
                                'MMM d'
                            )}`
                            : 'N/A'
                    }
                    subtitle={summary.date_range_end ? format(new Date(summary.date_range_end), 'yyyy') : ''}
                />
            </div>

            {/* Story Section: Time Patterns */}
            <section className="mb-10">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-xl font-semibold text-foreground">Time Patterns</h2>
                        <p className="text-sm text-muted-foreground">
                            When spending happens most often in the selected period.
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-card rounded-xl border border-border p-6 shadow-sm card-hover">
                        <h3 className="text-lg font-semibold text-foreground mb-4">Day-of-week spend</h3>
                        <div className="h-56">
                            <Bar
                                data={dayOfWeekData}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { display: false },
                                    },
                                    scales: {
                                        y: {
                                            beginAtZero: true,
                                            grid: { color: 'hsl(240 5.9% 90%)' },
                                            ticks: {
                                                callback: (value) => formatCurrency(value as number),
                                            },
                                        },
                                        x: { grid: { display: false } },
                                    },
                                }}
                            />
                        </div>
                    </div>
                    <div className="bg-card rounded-xl border border-border p-6 shadow-sm card-hover">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-foreground">Spending trend</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setTrendGranularity('daily')}
                                    className={
                                        trendGranularity === 'daily'
                                            ? 'btn btn-secondary px-3 py-1.5 text-xs'
                                            : 'btn btn-ghost px-3 py-1.5 text-xs'
                                    }
                                >
                                    Daily
                                </button>
                                <button
                                    onClick={() => setTrendGranularity('monthly')}
                                    className={
                                        trendGranularity === 'monthly'
                                            ? 'btn btn-secondary px-3 py-1.5 text-xs'
                                            : 'btn btn-ghost px-3 py-1.5 text-xs'
                                    }
                                >
                                    Monthly
                                </button>
                            </div>
                        </div>
                        <div className="h-56">
                            <Line
                                data={trendChartData}
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { display: false },
                                    },
                                    scales: {
                                        y: {
                                            beginAtZero: true,
                                            grid: { color: 'hsl(240 5.9% 90%)' },
                                            ticks: {
                                                callback: (value) => formatCurrency(value as number),
                                            },
                                        },
                                        x: { grid: { display: false } },
                                    },
                                }}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-4">
                            <div className="bg-muted/40 rounded-lg p-3">
                                <p className="text-xs text-muted-foreground">Month-over-month</p>
                                <p className="text-lg font-semibold text-foreground">
                                    {formatPercent(momChange)}
                                </p>
                                <p className="text-xs text-muted-foreground">vs previous month</p>
                            </div>
                            <div className="bg-muted/40 rounded-lg p-3">
                                <p className="text-xs text-muted-foreground">Year-over-year</p>
                                <p className="text-lg font-semibold text-foreground">
                                    {formatPercent(yoyChange)}
                                </p>
                                <p className="text-xs text-muted-foreground">vs same month last year</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Story Section: Category distribution */}
            <section className="mb-10">
                <div className="mb-4">
                    <h2 className="text-xl font-semibold text-foreground">Category Story</h2>
                    <p className="text-sm text-muted-foreground">
                        Start with primary categories and drill down to detailed spend drivers.
                    </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-card rounded-xl border border-border p-6 shadow-sm card-hover">
                        <h3 className="text-lg font-semibold text-foreground mb-4">Primary categories</h3>
                        <div className="h-64 flex items-center justify-center">
                            <Doughnut
                                data={categoryChartData}
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
                                    },
                                }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-4">
                            We follow the standard Plaid category hierarchy. Update categories in the Categories page.
                        </p>
                    </div>
                    <div className="bg-card rounded-xl border border-border p-6 shadow-sm card-hover">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <h3 className="text-lg font-semibold text-foreground">Detailed breakdown</h3>
                            <select
                                value={selectedPrimary ?? ''}
                                onChange={(e) => setSelectedPrimary(e.target.value)}
                                className="select min-w-[220px]"
                            >
                                {primaryCategories.map((cat) => (
                                    <option key={cat.primary} value={cat.primary}>
                                        {normalizeCategoryLabel(cat.primary)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {categoryDrilldownData ? (
                            <div className="h-64 flex items-center justify-center">
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
                                        },
                                    }}
                                />
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground">No category drilldown available.</div>
                        )}
                    </div>
                </div>
            </section>

            {/* Story Section: Merchant loyalty */}
            <section className="mb-10">
                <div className="mb-4">
                    <h2 className="text-xl font-semibold text-foreground">Merchant Loyalty & Frequency</h2>
                    <p className="text-sm text-muted-foreground">
                        Where repeat spend shows loyalty over time.
                    </p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="bg-card rounded-xl border border-border p-6 shadow-sm card-hover">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-foreground">Top merchants</h3>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setMerchantMetric('amount')}
                                    className={
                                        merchantMetric === 'amount'
                                            ? 'btn btn-secondary px-3 py-1.5 text-xs'
                                            : 'btn btn-ghost px-3 py-1.5 text-xs'
                                    }
                                >
                                    By amount
                                </button>
                                <button
                                    onClick={() => setMerchantMetric('count')}
                                    className={
                                        merchantMetric === 'count'
                                            ? 'btn btn-secondary px-3 py-1.5 text-xs'
                                            : 'btn btn-ghost px-3 py-1.5 text-xs'
                                    }
                                >
                                    By frequency
                                </button>
                            </div>
                        </div>
                        <div className="h-64">
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
                                            grid: { color: 'hsl(240 5.9% 90%)' },
                                            ticks: {
                                                callback: (value) =>
                                                    merchantMetric === 'amount'
                                                        ? formatCurrency(value as number)
                                                        : `${value}`,
                                            },
                                        },
                                        y: { grid: { display: false } },
                                    },
                                }}
                            />
                        </div>
                    </div>
                    <div className="bg-card rounded-xl border border-border p-6 shadow-sm card-hover">
                        <h3 className="text-lg font-semibold text-foreground mb-4">Repeat activity</h3>
                        <div className="h-64">
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
                                            grid: { color: 'hsl(240 5.9% 90%)' },
                                        },
                                        y: { grid: { display: false } },
                                    },
                                }}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                            Repeat activity shows how often a merchant appears across months in this period.
                        </p>
                    </div>
                </div>
                <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-border">
                        <h3 className="text-lg font-semibold text-foreground">Loyalty details</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border bg-muted/50">
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Merchant
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Transactions
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Active months
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Avg / month
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Spend
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {loyaltyMerchants.slice(0, 10).map((merchant) => (
                                    <tr key={merchant.merchant} className="table-row-hover">
                                        <td className="px-6 py-4 whitespace-nowrap text-foreground font-medium">
                                            {merchant.merchant}
                                        </td>
                                        <td className="px-6 py-4 text-right text-muted-foreground">
                                            {merchant.transaction_count}
                                        </td>
                                        <td className="px-6 py-4 text-right text-muted-foreground">
                                            {merchant.distinct_months}
                                        </td>
                                        <td className="px-6 py-4 text-right text-muted-foreground">
                                            {merchant.average_monthly_count.toFixed(1)}
                                        </td>
                                        <td className="px-6 py-4 text-right font-semibold text-foreground">
                                            {formatCurrency(merchant.total_amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* Category breakdown table */}
            <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-border">
                    <h3 className="text-lg font-semibold text-foreground">
                        Category Breakdown
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Category
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Amount
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Transactions
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Share
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {summary.by_category.map((cat, index) => (
                                <tr key={cat.category_id ?? 'uncategorized'} className="table-row-hover">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-3 h-3 rounded-full"
                                                style={{ backgroundColor: getPaletteColor(index) }}
                                            />
                                            <span className="font-medium text-foreground">
                                                {normalizeCategoryDisplay(cat.category_name)}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right font-semibold text-foreground">
                                        {formatCurrency(cat.total_amount)}
                                    </td>
                                    <td className="px-6 py-4 text-right text-muted-foreground">
                                        {cat.transaction_count}
                                    </td>
                                    <td className="px-6 py-4 text-right">
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
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

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
        <div className="bg-card rounded-xl border border-border p-5 shadow-sm card-hover">
            <div className="flex items-start justify-between">
                <div className="p-2 bg-muted rounded-lg">
                    {icon}
                </div>
            </div>
            <div className="mt-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
                {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
            </div>
        </div>
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

function formatPercent(value: number): string {
    if (!Number.isFinite(value)) {
        return '0.0%';
    }
    const sign = value > 0 ? '+' : '';
    return `${sign}${(value * 100).toFixed(1)}%`;
}

function getPaletteColor(index: number): string {
    return CHART_PALETTE[index % CHART_PALETTE.length];
}

function withAlpha(color: string, alpha: number): string {
    if (color.startsWith('#')) {
        const hex = color.replace('#', '');
        const normalized = hex.length === 3
            ? hex
                  .split('')
                  .map((c) => `${c}${c}`)
                  .join('')
            : hex;
        const int = parseInt(normalized, 16);
        const r = (int >> 16) & 255;
        const g = (int >> 8) & 255;
        const b = int & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
}

function normalizeCategoryLabel(name: string, primary?: string): string {
    const normalized = normalizeCategoryBase(name, primary);
    return toTitleCase(normalized);
}

function normalizeCategoryDisplay(name: string): string {
    if (!name) {
        return 'Uncategorized';
    }
    const cleaned = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(/\s*[:>\-]\s*/).filter(Boolean);
    if (parts.length >= 2) {
        return `${toTitleCase(parts[0])} - ${toTitleCase(parts.slice(1).join(' '))}`;
    }
    return toTitleCase(cleaned);
}

function normalizeCategoryBase(name: string, primary?: string): string {
    if (!name) {
        return 'Uncategorized';
    }
    let cleaned = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    if (primary) {
        const primaryClean = primary.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
        const regex = new RegExp(`^${primaryClean}\s*[:>\-]?\s*`, 'i');
        cleaned = cleaned.replace(regex, '').trim();
    }
    return cleaned;
}

function toTitleCase(value: string): string {
    return value
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
