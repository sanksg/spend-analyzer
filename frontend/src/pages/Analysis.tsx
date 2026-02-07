// src/pages/Analysis.tsx
import React, { useState } from 'react';
import { askData } from '../api/insights';
import { AnalysisResponse } from '../types';

// Utils
const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

const formatValue = (key: string, value: any) => {
    if (value === null || value === undefined) return '-';
    // If key contains Amount / Spend / Cost (case insensitive), format as currency
    if (/amount|spend|cost|balance|payment/i.test(key) && typeof value === 'number') {
        return formatCurrency(value);
    }
    return String(value);
};

// Icons
const SendIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
    </svg>
);

const SQLIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-slate-400 hover:text-indigo-600">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
    </svg>
);

export default function Analysis() {
    return (
        <div className="p-6 max-w-5xl mx-auto h-[calc(100vh-2rem)] flex flex-col">
            <h1 className="text-3xl font-bold text-slate-800 mb-6 flex items-center gap-3">
                <span className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                    </svg>
                </span>
                Ask Your Data
            </h1>

            <AskDataPanel />
        </div>
    );
}

function AskDataPanel() {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<AnalysisResponse | null>(null);
    const [showSQL, setShowSQL] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setLoading(true);
        setShowSQL(false);
        try {
            const res = await askData(query);
            setHistory(res);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };
    
    // Helper to determine if we should show the "No results" empty state
    const hasData = history?.raw_data && history.raw_data.length > 0;
    const isSingleResult = hasData && history!.raw_data.length === 1 && Object.keys(history!.raw_data[0]).length === 1;

    return (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 p-6 overflow-y-auto bg-slate-50/50">
                {!history ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-6">
                        <div className="bg-white p-6 rounded-full shadow-sm border border-slate-100">
                            <svg className="w-12 h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                        </div>
                        <h3 className="text-xl font-semibold text-slate-600">What would you like to know?</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg w-full">
                            <SuggestionCard text="Total spend on Uber in 2024?" onClick={() => setQuery("Total spend on Uber in 2024")} />
                            <SuggestionCard text="Compare Food vs Travel spending" onClick={() => setQuery("Compare Food vs Travel spending")} />
                            <SuggestionCard text="Show my top 5 merchants last month" onClick={() => setQuery("Show my top 5 merchants last month")} />
                            <SuggestionCard text="List all transactions > 5000" onClick={() => setQuery("List all transactions > 5000")} />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-8 max-w-3xl mx-auto">
                        {/* User Question */}
                        <div className="flex justify-end">
                            <div className="bg-indigo-600 text-white px-5 py-3 rounded-2xl rounded-tr-none shadow-md max-w-[80%]">
                                <p className="text-lg">{query}</p>
                            </div>
                        </div>

                        {/* AI Answer / Result */}
                        <div className="flex justify-start w-full">
                            <div className="bg-white border border-slate-200 px-6 py-5 rounded-2xl rounded-tl-none shadow-md w-full space-y-4">
                                
                                {/* 1. Prioritize Single Value Answer (e.g. Total Spend) */}
                                {isSingleResult ? (
                                    <div className="py-2">
                                        <p className="text-sm text-slate-500 uppercase tracking-wide mb-1">Answer</p>
                                        <div className="text-4xl font-bold text-slate-800">
                                            {formatValue(Object.keys(history.raw_data[0])[0], Object.values(history.raw_data[0])[0])}
                                        </div>
                                    </div>
                                ) : (
                                    /* 2. Or Show Text Explanation */
                                    <div className="prose prose-slate max-w-none">
                                        <p className="text-slate-800 text-lg leading-relaxed whitespace-pre-wrap">{history.answer}</p>
                                    </div>
                                )}

                                {/* 3. Data Table (If more than 1 result, OR if not single value) */}
                                {hasData && !isSingleResult && (
                                    <div className="mt-4 border rounded-lg overflow-hidden">
                                        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase border-b">
                                            Result Data
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                                <thead className="bg-slate-50">
                                                    <tr>
                                                        {Object.keys(history.raw_data[0]).map(k => (
                                                            <th key={k} className="px-3 py-2 text-left font-medium text-slate-500 capitalize">{k.replace(/_/g, " ")}</th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200 bg-white">
                                                    {history.raw_data.slice(0, 5).map((row, i) => (
                                                        <tr key={i} className="hover:bg-slate-50">
                                                            {Object.entries(row).map(([k, v], j) => (
                                                                <td key={j} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                                                                    {formatValue(k, v)}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {history.raw_data.length > 5 && (
                                                <div className="px-3 py-2 text-xs text-slate-400 bg-slate-50 text-center">
                                                    +{history.raw_data.length - 5} more rows
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* 4. Empty State */}
                                {!hasData && (
                                    <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 text-center">
                                         <p className="text-slate-500">I couldn't find any relevant data for that query.</p>
                                    </div>
                                )}

                                {/* 5. SQL Debug Toggle */}
                                <div className="mt-2 flex justify-end">
                                    <button 
                                        type="button"
                                        onClick={() => setShowSQL(!showSQL)}
                                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 transition"
                                    >
                                        <SQLIcon />
                                        {showSQL ?  "Hide Technical Details" : "Show Technical Details"}
                                    </button>
                                </div>

                                {showSQL && (
                                    <div className="mt-3 animate-in fade-in duration-200">
                                        <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Generated SQL</p>
                                        <div className="bg-slate-900 rounded-lg p-3 overflow-x-auto">
                                            <code className="text-xs font-mono text-green-400 block whitespace-pre">
                                                {history.generated_sql}
                                            </code>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-6 border-t border-slate-100 bg-white">
                <form onSubmit={handleSubmit} className="max-w-3xl mx-auto flex gap-3">
                    <input
                        type="text"
                        className="flex-1 border border-slate-300 rounded-xl px-5 py-4 text-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition shadow-sm"
                        placeholder="Ask a question about your spending..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        disabled={loading}
                    />
                    <button
                        type="submit"
                        disabled={loading || !query.trim()}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 rounded-xl font-medium transition disabled:opacity-50 flex items-center shadow-sm"
                    >
                        {loading ? <span className="animate-spin text-2xl">⟳</span> : <SendIcon />}
                    </button>
                </form>
            </div>
        </div>
    );
}

function SuggestionCard({ text, onClick }: { text: string, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="text-sm text-slate-600 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 rounded-lg px-4 py-3 transition text-left"
        >
            {text}
        </button>
    )
}
