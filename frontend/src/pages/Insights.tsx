import { useEffect, useState } from 'react';
import { getSubscriptions, scanSubscriptions, getFees, getAnomalies } from '../api/insights';
import { Subscription } from '../types';

// Icons
const RefreshIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
);

const AlertIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-amber-500">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
    </svg>
);

export default function Insights() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8">
            <h1 className="text-3xl font-bold text-slate-800">Insights Dashboard</h1>

            {/* Top Cards Row */}
            <FeesSummaryCard />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Subscriptions & EMIs */}
                <SubscriptionPanel />

                {/* Right Column: Anomalies */}
                <AnomalyPanel />
            </div>
        </div>
    );
}

function FeesSummaryCard() {
    const [stats, setStats] = useState<any>(null);
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        getFees().then(setStats);
    }, []);

    if (!stats) return null;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-red-500">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    Fees & Taxes Analysis
                </h2>
                {stats.transactions.length > 0 && (
                    <button
                        onClick={() => setShowAll(!showAll)}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition"
                    >
                        {showAll ? 'Hide Transactions' : 'View All'}
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-red-50 rounded-lg p-4">
                    <p className="text-sm text-red-600 mb-1">Total Fees & Taxes</p>
                    <p className="text-2xl font-bold text-red-700">₹{stats.total.toLocaleString()}</p>
                </div>
                {Object.entries(stats.breakdown || {}).map(([key, val]: [string, any]) => (
                    <div key={key} className="border border-slate-100 rounded-lg p-4">
                        <p className="text-xs text-slate-500 mb-1 uppercase tracking-wide">{key}</p>
                        <p className="text-lg font-semibold text-slate-700">₹{val.toLocaleString()}</p>
                    </div>
                ))}
            </div>

            {/* Collapsible Transaction List */}
            {showAll && stats.transactions.length > 0 && (
                <div className="mt-6 border-t border-slate-100 pt-4 animate-in slide-in-from-top-2 duration-200">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Fee Transactions</h3>
                    <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-lg border border-slate-200">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 border-b">Date</th>
                                    <th className="px-4 py-2 border-b">Description</th>
                                    <th className="px-4 py-2 border-b text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {stats.transactions.map((t: any) => (
                                    <tr key={t.id} className="hover:bg-slate-50">
                                        <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{t.date}</td>
                                        <td className="px-4 py-2 font-medium text-slate-900">{t.description}</td>
                                        <td className="px-4 py-2 text-right font-medium text-red-600">₹{t.amount.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Recent Preview (hidden when showAll is true) */}
            {!showAll && stats.transactions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500 mb-2">Recent Charges:</p>
                    <div className="flex flex-wrap gap-2">
                        {stats.transactions.slice(0, 5).map((t: any) => (
                            <span key={t.id} className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 truncate max-w-[200px]" title={t.description}>
                                {t.date}: ₹{t.amount}
                            </span>
                        ))}
                        {stats.transactions.length > 5 && (
                            <button onClick={() => setShowAll(true)} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100 transition">
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
    const [loading, setLoading] = useState(false);

    const load = async () => {
        const data = await getSubscriptions();
        setSubs(data);
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

    useEffect(() => { load(); }, []);

    const totalMonthly = subs
        .filter(s => s.cadence.toLowerCase() === 'monthly')
        .reduce((sum, s) => sum + s.amount, 0);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[400px]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800">Recurring & EMIs</h2>
                    <p className="text-xs text-slate-500">Est. Monthly Commit: <span className="font-bold text-slate-700">₹{totalMonthly.toFixed(0)}</span></p>
                </div>
                <button
                    onClick={handleScan}
                    disabled={loading}
                    className="p-2 text-indigo-600 hover:bg-slate-200 rounded-full transition disabled:opacity-50"
                    title="Rescan"
                >
                    <RefreshIcon />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[500px] p-0">
                {subs.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                        <p>No subscriptions detected yet.</p>
                        <p className="text-sm mt-2">Click refresh to scan your transactions.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3">Merchant</th>
                                <th className="px-6 py-3">Amount</th>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3">Last Date</th>
                            </tr>
                        </thead>
                        <tbody>
                            {subs.map((sub) => (
                                <tr key={sub.id} className="border-b hover:bg-slate-50">
                                    <td className="px-6 py-4 font-medium text-slate-900">
                                        {sub.merchant}
                                        {((sub as any).kind === "installment") && (
                                            <span className="ml-2 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] rounded uppercase">EMI</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">₹{sub.amount}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs ${sub.cadence === 'Monthly' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                            }`}>
                                            {sub.cadence}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">{sub.last_seen}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

function AnomalyPanel() {
    const [anomalies, setAnomalies] = useState<any[]>([]);
    const [minAmount, setMinAmount] = useState(1000);

    const load = async () => {
        const data = await getAnomalies(minAmount);
        setAnomalies(data);
    };

    useEffect(() => { load(); }, [minAmount]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[400px]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <AlertIcon /> Anomalies
                    </h2>
                    <p className="text-xs text-slate-500">Unusual spending deviations</p>
                </div>
                <select
                    className="text-xs border border-slate-300 rounded p-1"
                    value={minAmount}
                    onChange={(e) => setMinAmount(Number(e.target.value))}
                >
                    <option value={0}>All Amounts</option>
                    <option value={1000}>&gt; ₹1,000</option>
                    <option value={5000}>&gt; ₹5,000</option>
                    <option value={10000}>&gt; ₹10,000</option>
                </select>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[500px]">
                {anomalies.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                        <div className="flex justify-center mb-2 text-green-500">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                        </div>
                        <p>No anomalies detected.</p>
                        <p className="text-xs mt-1">Spending matches historical patterns.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {anomalies.map((item, i) => (
                            <div key={i} className="p-4 hover:bg-slate-50 transition">
                                <div className="flex justify-between items-start mb-1">
                                    <div className="font-medium text-slate-900">{item.merchant}</div>
                                    <div className="font-bold text-red-600">₹{item.amount.toLocaleString()}</div>
                                </div>
                                <div className="flex justify-between items-center text-xs text-slate-500">
                                    <span>{item.date} • {item.category}</span>
                                    <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded">
                                        {item.severity}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
