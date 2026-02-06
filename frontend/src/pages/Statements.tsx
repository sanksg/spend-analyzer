import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Trash2, ChevronRight, AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { getStatements, deleteStatement } from '../api/client';
import type { Statement } from '../types';
import { format } from 'date-fns';

export default function Statements() {
    const [statements, setStatements] = useState<Statement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadStatements();
    }, []);

    async function loadStatements() {
        try {
            setLoading(true);
            const data = await getStatements();
            setStatements(data.statements);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load statements');
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(id: number, e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm('Delete this statement and all its transactions?')) return;

        try {
            await deleteStatement(id);
            setStatements((prev) => prev.filter((s) => s.id !== id));
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Delete failed');
        }
    }

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center">
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

    return (
        <div className="p-6 lg:p-8 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold text-foreground">Statements</h1>
                <Link
                    to="/upload"
                    className="btn btn-primary px-4 py-2.5 gap-2"
                >
                    <Upload className="w-4 h-4" />
                    Upload New
                </Link>
            </div>

            {statements.length === 0 ? (
                <div className="bg-card border-2 border-dashed border-border rounded-xl p-12 text-center">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                        No statements uploaded
                    </h3>
                    <p className="text-muted-foreground mb-4">
                        Upload a credit card statement to get started.
                    </p>
                    <Link
                        to="/upload"
                        className="btn btn-primary px-5 py-2.5"
                    >
                        Upload Statement
                    </Link>
                </div>
            ) : (
                <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border bg-muted/50">
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Statement
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Period
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Transactions
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Status
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Uploaded
                                </th>
                                <th className="px-6 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {statements.map((statement) => (
                                <tr key={statement.id} className="table-row-hover">
                                    <td className="px-6 py-4">
                                        <Link
                                            to={`/statements/${statement.id}`}
                                            className="flex items-center gap-3 hover:text-primary transition-colors"
                                        >
                                            <div className="p-2 bg-muted rounded-lg">
                                                <FileText className="w-5 h-5 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-foreground">
                                                    {statement.filename}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {statement.source_name || 'Unknown issuer'}
                                                </p>
                                            </div>
                                        </Link>
                                    </td>
                                    <td className="px-6 py-4 text-muted-foreground">
                                        {statement.period_start && statement.period_end ? (
                                            <>
                                                {format(new Date(statement.period_start), 'MMM d')} -{' '}
                                                {format(new Date(statement.period_end), 'MMM d, yyyy')}
                                            </>
                                        ) : (
                                            <span className="text-muted-foreground/70">Not detected</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="font-semibold text-foreground">
                                            {statement.transaction_count}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {statement.needs_review_count > 0 ? (
                                            <span className="badge badge-warning gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                {statement.needs_review_count} to review
                                            </span>
                                        ) : statement.transaction_count > 0 ? (
                                            <span className="badge badge-success gap-1">
                                                <CheckCircle className="w-3 h-3" />
                                                Ready
                                            </span>
                                        ) : (
                                            <span className="badge badge-secondary">
                                                Processing
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right text-muted-foreground text-sm">
                                        {format(new Date(statement.uploaded_at), 'MMM d, yyyy')}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={(e) => handleDelete(statement.id, e)}
                                                className="btn btn-ghost p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                title="Delete"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <Link
                                                to={`/statements/${statement.id}`}
                                                className="btn btn-ghost p-2 text-muted-foreground hover:text-primary"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </Link>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
