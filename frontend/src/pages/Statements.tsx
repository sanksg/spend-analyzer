import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Trash2, ChevronRight, AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { getStatements, deleteStatement } from '../api/client';
import type { Statement } from '../types';
import { format } from 'date-fns';

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../components/ui/table";
import { Button, buttonVariants } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { cn } from '../lib/utils';

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
                <div className="bg-destructive/10 text-destructive p-4 rounded-xl border border-destructive/20 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Statements</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your uploaded credit card statements.
                    </p>
                </div>
                <Link
                    to="/upload"
                    className={cn(buttonVariants({ variant: "default" }), "gap-2")}
                >
                    <Upload className="w-4 h-4" />
                    Upload New
                </Link>
            </div>

            {statements.length === 0 ? (
                <Card className="border-dashed p-12 text-center">
                    <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                        No statements uploaded
                    </h3>
                    <p className="text-muted-foreground mb-4">
                        Upload a credit card statement to get started.
                    </p>
                    <Link
                        to="/upload"
                        className={buttonVariants({ variant: "default" })}
                    >
                        Upload Statement
                    </Link>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Statement</TableHead>
                                <TableHead>Period</TableHead>
                                <TableHead className="text-right">Transactions</TableHead>
                                <TableHead className="text-center">Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {statements.map((stmt) => (
                                <TableRow key={stmt.id} className="group">
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-muted rounded-md text-muted-foreground group-hover:text-primary transition-colors">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="text-foreground">{stmt.issuing_bank || 'Unknown Bank'}</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Card owner: {stmt.source_name || 'Unknown'}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    Uploaded {stmt.uploaded_at ? format(new Date(stmt.uploaded_at), 'MMM d, yyyy') : '-'}
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">
                                            {stmt.period_start && stmt.period_end ? (
                                                <>
                                                    {format(new Date(stmt.period_start), 'MMM d')} -{' '}
                                                    {format(new Date(stmt.period_end), 'MMM d, yyyy')}
                                                </>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {stmt.transaction_count}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant="outline" className="text-success bg-success/10 border-success/30 gap-1 pl-1.5 pr-2.5">
                                            <CheckCircle className="w-3.5 h-3.5" />
                                            Processed
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Link
                                                to={`/statements/${stmt.id}`}
                                                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground hover:text-primary")}
                                            >
                                                Details
                                            </Link>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                onClick={(e) => handleDelete(stmt.id, e)}
                                                title="Delete statement"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                            <Link
                                                to={`/transactions?statement_id=${stmt.id}`}
                                                className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-primary")}
                                                title="View transactions"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </Link>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )}
        </div>
    );
}

