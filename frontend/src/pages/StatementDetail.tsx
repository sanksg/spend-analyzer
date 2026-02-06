import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    FileText,
    RefreshCw,
    CheckCircle,
    AlertCircle,
    Clock,
    XCircle,
    ArrowLeft,
    Hash,
    CreditCard,
    CalendarRange,
    FileSearch,
    ExternalLink,
} from 'lucide-react';
import { getStatement, getStatementJobs, reparseStatement, getTransactions } from '../api/client';
import type { Statement, ParseJob, Transaction } from '../types';
import { format } from 'date-fns';
import clsx from 'clsx';

export default function StatementDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [statement, setStatement] = useState<Statement | null>(null);
    const [jobs, setJobs] = useState<ParseJob[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [reparsing, setReparsing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const statementId = parseInt(id || '0', 10);

    useEffect(() => {
        if (statementId) {
            loadData();
        }
    }, [statementId]);

    // Auto-refresh while job is processing
    useEffect(() => {
        const latestJob = jobs[0];
        if (latestJob && (latestJob.status === 'pending' || latestJob.status === 'processing')) {
            const interval = setInterval(loadData, 3000);
            return () => clearInterval(interval);
        }
    }, [jobs]);

    async function loadData() {
        try {
            setLoading(true);
            const [stmt, jobList, txnData] = await Promise.all([
                getStatement(statementId),
                getStatementJobs(statementId),
                getTransactions({ statement_id: statementId, limit: 200 }),
            ]);
            setStatement(stmt);
            setJobs(jobList);
            setTransactions(txnData.transactions);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load statement');
        } finally {
            setLoading(false);
        }
    }

    async function handleReparse() {
        try {
            setReparsing(true);
            await reparseStatement(statementId);
            // Reload data after a short delay
            setTimeout(loadData, 1000);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Reparse failed');
        } finally {
            setReparsing(false);
        }
    }

    if (loading && !statement) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
                    <p className="text-muted-foreground text-sm">Loading statement...</p>
                </div>
            </div>
        );
    }

    if (error || !statement) {
        return (
            <div className="p-8">
                <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-center gap-3">
                    <XCircle className="w-5 h-5 flex-shrink-0" />
                    <span>{error || 'Statement not found'}</span>
                </div>
            </div>
        );
    }

    const latestJob = jobs[0];
    const isProcessing = latestJob && (latestJob.status === 'pending' || latestJob.status === 'processing');

    return (
        <div className="p-8 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/statements')}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                    aria-label="Back to statements"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold text-foreground truncate">{statement.filename}</h1>
                    <p className="text-muted-foreground flex items-center gap-2">
                        <CreditCard className="w-4 h-4" />
                        {statement.source_name || 'Unknown issuer'}
                    </p>
                </div>
                <button
                    onClick={handleReparse}
                    disabled={reparsing || isProcessing}
                    className="btn btn-secondary flex items-center gap-2"
                >
                    <RefreshCw className={clsx('w-4 h-4', (reparsing || isProcessing) && 'animate-spin')} />
                    {reparsing ? 'Starting...' : isProcessing ? 'Processing...' : 'Reparse'}
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card-hover p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Transactions</p>
                            <p className="text-2xl font-bold text-foreground">{statement.transaction_count}</p>
                        </div>
                    </div>
                </div>
                <div className="card-hover p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-warning/10 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-warning" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Needs Review</p>
                            <p className="text-2xl font-bold text-warning">{statement.needs_review_count}</p>
                        </div>
                    </div>
                </div>
                <div className="card-hover p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-lg">
                            <FileSearch className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Pages</p>
                            <p className="text-2xl font-bold text-foreground">{statement.page_count || '—'}</p>
                        </div>
                    </div>
                </div>
                <div className="card-hover p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-accent/50 rounded-lg">
                            <CalendarRange className="w-5 h-5 text-foreground" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Period</p>
                            <p className="text-lg font-semibold text-foreground">
                                {statement.period_start && statement.period_end
                                    ? `${format(new Date(statement.period_start), 'MMM d')} - ${format(
                                        new Date(statement.period_end),
                                        'MMM d, yyyy'
                                    )}`
                                    : 'Not detected'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Latest job status */}
            {latestJob && (
                <div className="card-hover p-4">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                            <JobStatusIcon status={latestJob.status} />
                            <div>
                                <p className="font-medium text-foreground">
                                    Parse Job #{latestJob.id}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {latestJob.gemini_model} • Attempt {latestJob.attempt_count}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <JobStatusBadge status={latestJob.status} />
                            {latestJob.error_message && (
                                <p className="text-sm text-destructive mt-2 max-w-md">{latestJob.error_message}</p>
                            )}
                        </div>
                    </div>
                    {isProcessing && (
                        <div className="mt-4 pt-4 border-t border-border">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <div className="animate-pulse w-2 h-2 bg-primary rounded-full" />
                                Auto-refreshing every 3 seconds...
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Transactions table */}
            <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-foreground">Transactions</h3>
                    <button
                        onClick={() => navigate(`/transactions?statement_id=${statementId}`)}
                        className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
                    >
                        View all
                        <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                </div>

                {transactions.length === 0 ? (
                    <div className="p-12 text-center">
                        <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-muted-foreground">No transactions parsed yet</p>
                        {isProcessing && (
                            <p className="text-sm text-muted-foreground mt-1">Processing in progress...</p>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider w-14">
                                        <Hash className="w-4 h-4" />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Date
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Description
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Category
                                    </th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Amount
                                    </th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Status
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {transactions.slice(0, 20).map((txn, index) => (
                                    <tr key={txn.id} className="table-row-hover">
                                        <td className="px-4 py-3 text-muted-foreground text-sm font-mono">
                                            {index + 1}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-sm">
                                            {format(new Date(txn.posted_date), 'MMM d, yyyy')}
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-foreground truncate max-w-xs">
                                                {txn.merchant_normalized || txn.description}
                                            </p>
                                            {txn.merchant_normalized && txn.merchant_normalized !== txn.description && (
                                                <p className="text-xs text-muted-foreground truncate max-w-xs mt-0.5">
                                                    {txn.description}
                                                </p>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {txn.category_name ? (
                                                <span
                                                    className="badge"
                                                    style={{
                                                        backgroundColor: `${txn.category_color || '#888'}15`,
                                                        color: txn.category_color || '#888',
                                                        borderColor: `${txn.category_color || '#888'}30`,
                                                    }}
                                                >
                                                    <span
                                                        className="w-2 h-2 rounded-full mr-1.5"
                                                        style={{ backgroundColor: txn.category_color || '#888' }}
                                                    />
                                                    {txn.category_name}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                                            <span className={txn.amount >= 0 ? 'text-destructive' : 'text-success'}>
                                                {txn.amount >= 0 ? '' : '+'}
                                                {formatCurrency(Math.abs(txn.amount))}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {txn.needs_review ? (
                                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-warning/10">
                                                    <AlertCircle className="w-4 h-4 text-warning" />
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-success/10">
                                                    <CheckCircle className="w-4 h-4 text-success" />
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {transactions.length > 20 && (
                    <div className="px-6 py-3 bg-muted/30 border-t border-border text-center">
                        <p className="text-sm text-muted-foreground">
                            Showing 20 of {transactions.length} transactions.{' '}
                            <button
                                onClick={() => navigate(`/transactions?statement_id=${statementId}`)}
                                className="text-primary hover:underline"
                            >
                                View all
                            </button>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function JobStatusIcon({ status }: { status: ParseJob['status'] }) {
    const iconClass = 'w-10 h-10';
    switch (status) {
        case 'completed':
            return (
                <div className="p-2 bg-success/10 rounded-full">
                    <CheckCircle className={`${iconClass} text-success`} />
                </div>
            );
        case 'needs_review':
            return (
                <div className="p-2 bg-warning/10 rounded-full">
                    <AlertCircle className={`${iconClass} text-warning`} />
                </div>
            );
        case 'failed':
            return (
                <div className="p-2 bg-destructive/10 rounded-full">
                    <XCircle className={`${iconClass} text-destructive`} />
                </div>
            );
        case 'processing':
            return (
                <div className="p-2 bg-primary/10 rounded-full">
                    <RefreshCw className={`${iconClass} text-primary animate-spin`} />
                </div>
            );
        default:
            return (
                <div className="p-2 bg-muted rounded-full">
                    <Clock className={`${iconClass} text-muted-foreground`} />
                </div>
            );
    }
}

function JobStatusBadge({ status }: { status: ParseJob['status'] }) {
    const styles: Record<string, string> = {
        completed: 'bg-success/10 text-success border-success/20',
        needs_review: 'bg-warning/10 text-warning border-warning/20',
        failed: 'bg-destructive/10 text-destructive border-destructive/20',
        processing: 'bg-primary/10 text-primary border-primary/20',
        pending: 'bg-muted text-muted-foreground border-border',
    };

    return (
        <span className={clsx('badge capitalize', styles[status] || styles.pending)}>
            {status.replace('_', ' ')}
        </span>
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
