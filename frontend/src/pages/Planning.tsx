import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

import {
    deleteSavingsGoal,
    getCashflowForecast,
    getPayoffPlan,
    getRecommendations,
    getSavingsGoals,
    getUpcomingBills,
    getWeeklyActions,
    upsertSavingsGoal,
} from '../api/planner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import {
    CashflowForecastResponse,
    PayoffPlanResponse,
    Recommendation,
    SavingsGoal,
    UpcomingBillsResponse,
    WeeklyAction,
} from '../types';

const money = (value: number) => `₹${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function Planning() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Planning</h1>
                <p className="text-muted-foreground mt-1">
                    Stay ahead with upcoming bills, short-term cashflow, and payoff planning.
                </p>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <UpcomingBillsCard />
                <CashflowForecastCard />
            </div>

            <PayoffPlannerCard />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <SavingsGoalsCard />
                <WeeklyActionsCard />
            </div>

            <RecommendationsCard />
        </div>
    );
}

function UpcomingBillsCard() {
    const [days, setDays] = useState(30);
    const [data, setData] = useState<UpcomingBillsResponse | null>(null);
    const [loading, setLoading] = useState(true);

    const load = async (windowDays: number) => {
        setLoading(true);
        try {
            const next = await getUpcomingBills(windowDays);
            setData(next);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(days);
    }, []);

    const reminderVariant = (level: string) => {
        if (level === 'urgent') return 'destructive' as const;
        if (level === 'upcoming') return 'secondary' as const;
        return 'outline' as const;
    };

    return (
        <Card>
            <CardHeader className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <CardTitle>Upcoming Bills</CardTitle>
                        <CardDescription>Recurring charges due soon.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            className="w-24"
                            min={7}
                            max={120}
                            value={days}
                            onChange={(e) => setDays(Math.max(7, Math.min(120, Number(e.target.value || 30))))}
                        />
                        <Button size="sm" onClick={() => load(days)}>Refresh</Button>
                    </div>
                </div>
                <div className="text-sm text-muted-foreground">
                    {data ? `${data.items.length} bills · ${money(data.total_due)} due in ${data.window_days} days` : '—'}
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading upcoming bills...</p>
                ) : !data || data.items.length === 0 ? (
                    <div className="text-sm text-muted-foreground border rounded-lg p-5 text-center">
                        No recurring charges due in this window.
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                        {data.items.map((bill) => (
                            <div key={bill.subscription_id} className="border rounded-lg p-3 flex justify-between items-center">
                                <div>
                                    <div className="font-medium text-foreground">{bill.merchant}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                        {bill.cadence} · due {new Date(bill.next_due_date).toLocaleDateString()}
                                    </div>
                                </div>
                                <div className="text-right space-y-1">
                                    <div className="font-semibold">{money(bill.amount)}</div>
                                    <Badge variant={reminderVariant(bill.reminder_level)}>
                                        {bill.days_until_due} days
                                    </Badge>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function CashflowForecastCard() {
    const [days, setDays] = useState(30);
    const [startingCash, setStartingCash] = useState('0');
    const [data, setData] = useState<CashflowForecastResponse | null>(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const next = await getCashflowForecast(days, Number(startingCash || '0'));
            setData(next);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    return (
        <Card>
            <CardHeader className="space-y-2">
                <CardTitle>Cashflow Forecast</CardTitle>
                <CardDescription>Short-term outflow projection from recurring and variable spend.</CardDescription>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Input
                        type="number"
                        min={14}
                        max={120}
                        value={days}
                        onChange={(e) => setDays(Math.max(14, Math.min(120, Number(e.target.value || 30))))}
                        placeholder="Days"
                    />
                    <Input
                        type="number"
                        value={startingCash}
                        onChange={(e) => setStartingCash(e.target.value)}
                        placeholder="Starting cash"
                    />
                    <Button onClick={load}>Forecast</Button>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <p className="text-sm text-muted-foreground">Calculating forecast...</p>
                ) : !data ? (
                    <p className="text-sm text-muted-foreground">No forecast data.</p>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Stat label="Recurring" value={money(data.recurring_commitments)} />
                            <Stat label="Variable" value={money(data.variable_projected)} />
                            <Stat label="Projected Outflow" value={money(data.total_projected_outflow)} />
                            <Stat label="Ending Cash" value={money(data.projected_ending_cash)} />
                        </div>

                        {data.projected_ending_cash < 0 && (
                            <div className="text-sm border rounded-lg p-3 bg-destructive/5 border-destructive/20 text-destructive flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5" />
                                Projected cash turns negative. Consider reducing discretionary spend or increasing payment buffer.
                            </div>
                        )}

                        <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-muted-foreground">
                                    <tr>
                                        <th className="text-left p-2">Date</th>
                                        <th className="text-right p-2">Projected Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.points
                                        .filter((_, index) => index % 7 === 0 || index === data.points.length - 1)
                                        .map((point) => (
                                            <tr key={point.date} className="border-t">
                                                <td className="p-2">{new Date(point.date).toLocaleDateString()}</td>
                                                <td className="p-2 text-right">{money(point.projected_balance)}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function PayoffPlannerCard() {
    const [currentBalance, setCurrentBalance] = useState('50000');
    const [monthlyPayment, setMonthlyPayment] = useState('7000');
    const [apr, setApr] = useState('');
    const [data, setData] = useState<PayoffPlanResponse | null>(null);
    const [loading, setLoading] = useState(false);

    const runPlan = async () => {
        setLoading(true);
        try {
            const payload = {
                current_balance: Number(currentBalance || '0'),
                monthly_payment: Number(monthlyPayment || '0'),
                ...(apr ? { apr_percentage: Number(apr) } : {}),
            };
            const next = await getPayoffPlan(payload);
            setData(next);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        runPlan();
    }, []);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Credit Payoff Planner</CardTitle>
                <CardDescription>
                    Compare monthly payment impact on payoff time and interest.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <Input
                        type="number"
                        value={currentBalance}
                        onChange={(e) => setCurrentBalance(e.target.value)}
                        placeholder="Current balance"
                    />
                    <Input
                        type="number"
                        value={monthlyPayment}
                        onChange={(e) => setMonthlyPayment(e.target.value)}
                        placeholder="Monthly payment"
                    />
                    <Input
                        type="number"
                        step="0.1"
                        value={apr}
                        onChange={(e) => setApr(e.target.value)}
                        placeholder="APR % (optional)"
                    />
                    <Button onClick={runPlan} disabled={loading}>{loading ? 'Calculating...' : 'Run Plan'}</Button>
                </div>

                {!data ? (
                    <p className="text-sm text-muted-foreground">No plan available yet.</p>
                ) : data.status !== 'ok' && data.status !== 'paid' ? (
                    <div className="text-sm border rounded-lg p-3 bg-warning/10 border-warning/20 text-foreground">
                        Payment is too low to reduce balance with this APR. Increase monthly payment.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Stat label="APR" value={`${data.apr_percentage}%`} />
                            <Stat label="Months" value={String(data.months_to_payoff ?? 0)} />
                            <Stat label="Interest" value={money(data.total_interest ?? 0)} />
                            <Stat label="Total Paid" value={money(data.total_paid ?? 0)} />
                        </div>

                        <div className="rounded-lg border overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50 text-muted-foreground">
                                    <tr>
                                        <th className="text-left p-2">Month</th>
                                        <th className="text-right p-2">Interest</th>
                                        <th className="text-right p-2">Principal</th>
                                        <th className="text-right p-2">Ending</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.schedule.slice(0, 12).map((row) => (
                                        <tr key={row.month} className="border-t">
                                            <td className="p-2">{row.month}</td>
                                            <td className="p-2 text-right">{money(row.interest)}</td>
                                            <td className="p-2 text-right">{money(row.principal)}</td>
                                            <td className="p-2 text-right">{money(row.ending_balance)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="border rounded-lg p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="font-semibold text-foreground mt-1">{value}</div>
        </div>
    );
}

function SavingsGoalsCard() {
    const [goals, setGoals] = useState<SavingsGoal[]>([]);
    const [name, setName] = useState('');
    const [targetAmount, setTargetAmount] = useState('');
    const [currentAmount, setCurrentAmount] = useState('0');
    const [targetDate, setTargetDate] = useState('');
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const response = await getSavingsGoals();
            setGoals(response.goals);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const handleAdd = async () => {
        if (!name.trim() || Number(targetAmount || '0') <= 0) return;
        try {
            await upsertSavingsGoal({
                name: name.trim(),
                target_amount: Number(targetAmount),
                current_amount: Number(currentAmount || '0'),
                ...(targetDate ? { target_date: targetDate } : {}),
            });
            setName('');
            setTargetAmount('');
            setCurrentAmount('0');
            setTargetDate('');
            await load();
        } catch (error) {
            console.error(error);
        }
    };

    const handleDelete = async (goalId: string) => {
        try {
            await deleteSavingsGoal(goalId);
            await load();
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Savings Goals</CardTitle>
                <CardDescription>Track goal progress and funding targets.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goal name" />
                    <Input
                        type="number"
                        value={targetAmount}
                        onChange={(e) => setTargetAmount(e.target.value)}
                        placeholder="Target amount"
                    />
                    <Input
                        type="number"
                        value={currentAmount}
                        onChange={(e) => setCurrentAmount(e.target.value)}
                        placeholder="Current saved"
                    />
                    <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                </div>
                <Button onClick={handleAdd} className="w-full">Add Goal</Button>

                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading goals...</p>
                ) : goals.length === 0 ? (
                    <p className="text-sm text-muted-foreground border rounded-lg p-4 text-center">No goals yet.</p>
                ) : (
                    <div className="space-y-2 max-h-[260px] overflow-y-auto">
                        {goals.map((goal) => {
                            const pct = goal.target_amount > 0
                                ? Math.min((goal.current_amount / goal.target_amount) * 100, 100)
                                : 0;
                            return (
                                <div key={goal.id} className="border rounded-lg p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-medium text-foreground">{goal.name}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {money(goal.current_amount)} / {money(goal.target_amount)}
                                                {goal.target_date ? ` · by ${new Date(goal.target_date).toLocaleDateString()}` : ''}
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(goal.id)}>
                                            Remove
                                        </Button>
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                                        <div className="h-2 bg-primary" style={{ width: `${pct}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function WeeklyActionsCard() {
    const [startingCash, setStartingCash] = useState('0');
    const [actions, setActions] = useState<WeeklyAction[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const response = await getWeeklyActions(Number(startingCash || '0'));
            setActions(response.actions);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const variantForPriority = (priority: string) => {
        if (priority === 'high') return 'destructive' as const;
        if (priority === 'medium') return 'warning' as const;
        return 'secondary' as const;
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Weekly Actions</CardTitle>
                <CardDescription>Short list of actions to improve outcomes this week.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2">
                    <Input
                        type="number"
                        value={startingCash}
                        onChange={(e) => setStartingCash(e.target.value)}
                        placeholder="Starting cash"
                    />
                    <Button onClick={load}>Refresh</Button>
                </div>

                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading weekly actions...</p>
                ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {actions.map((action, index) => (
                            <div key={`${action.kind}-${index}`} className="border rounded-lg p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="font-medium text-foreground">{action.title}</div>
                                    <Badge variant={variantForPriority(action.priority)}>{action.priority}</Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{action.detail}</p>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function RecommendationsCard() {
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const response = await getRecommendations();
            setRecommendations(response.recommendations);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Recommendations</CardTitle>
                    <CardDescription>Rule-based savings opportunities for this cycle.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading recommendations...</p>
                ) : (
                    <div className="space-y-2">
                        {recommendations.map((recommendation, index) => (
                            <div key={`${recommendation.kind}-${index}`} className="border rounded-lg p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="font-medium text-foreground">{recommendation.title}</div>
                                    {recommendation.potential_savings !== null && recommendation.potential_savings !== undefined && (
                                        <Badge variant="success">Save ~{money(recommendation.potential_savings)}</Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{recommendation.detail}</p>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
