import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Search,
    Filter,
    CheckCircle,
    AlertCircle,
    X,
    Flag,
    ListFilter
} from 'lucide-react';
import {
    getTransactions,
    getCategories,
    updateTransaction,
    bulkCategorize,
    approveTransaction,
} from '../api/client';
import type { Transaction, Category } from '../types';
import { format } from 'date-fns';
import clsx from 'clsx';

import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../components/ui/table';
import {
    Card,
    CardContent,
} from '../components/ui/card';

export default function Transactions() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [total, setTotal] = useState(0);
    const [totalAmount, setTotalAmount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [showFilters, setShowFilters] = useState(false);

    // Filters from URL
    const filters = useMemo(
        () => ({
            statement_id: searchParams.get('statement_id')
                ? parseInt(searchParams.get('statement_id')!, 10)
                : undefined,
            category_id: searchParams.get('category_id')
                ? parseInt(searchParams.get('category_id')!, 10)
                : undefined,
            needs_review: searchParams.get('needs_review') === 'true' ? true : undefined,
            start_date: searchParams.get('start_date') || undefined,
            end_date: searchParams.get('end_date') || undefined,
            search: searchParams.get('search') || undefined,
            page: Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1),
            page_size: [25, 50, 100, 200].includes(parseInt(searchParams.get('page_size') || '50', 10))
                ? parseInt(searchParams.get('page_size') || '50', 10)
                : 50,
        }),
        [searchParams]
    );

    const activeFiltersCount = useMemo(() => {
        let count = 0;
        if (filters.search) count += 1;
        if (filters.category_id !== undefined) count += 1;
        if (filters.needs_review) count += 1;
        if (filters.start_date) count += 1;
        if (filters.end_date) count += 1;
        return count;
    }, [filters]);

    const totalPages = Math.max(1, Math.ceil(total / filters.page_size));
    const pageStart = total === 0 ? 0 : (filters.page - 1) * filters.page_size + 1;
    const pageEnd = total === 0 ? 0 : Math.min(total, filters.page * filters.page_size);

    useEffect(() => {
        loadData();
    }, [filters]);

    async function loadData() {
        try {
            setLoading(true); // Don't wipe data, just indicate loading? Actually for table replace it's fine.
            const [txnData, catData] = await Promise.all([
                getTransactions({
                    statement_id: filters.statement_id,
                    category_id: filters.category_id,
                    needs_review: filters.needs_review,
                    start_date: filters.start_date,
                    end_date: filters.end_date,
                    search: filters.search,
                    skip: (filters.page - 1) * filters.page_size,
                    limit: filters.page_size,
                }),
                getCategories(),
            ]);
            setTransactions(txnData.transactions);
            setTotal(txnData.total);
            setTotalAmount(txnData.total_amount);
            setCategories(catData.categories);
            setSelectedIds(new Set());
        } catch (err) {
            console.error('Failed to load transactions:', err);
        } finally {
            setLoading(false);
        }
    }

    function updateFilter(
        key: string,
        value: string | null,
        options: { resetPage?: boolean } = { resetPage: true }
    ) {
        const newParams = new URLSearchParams(searchParams);
        if (value) {
            newParams.set(key, value);
        } else {
            newParams.delete(key);
        }

        if (options.resetPage !== false && key !== 'page') {
            newParams.set('page', '1');
        }

        setSearchParams(newParams);
    }

    async function handleCategoryChange(txnId: number, categoryId: number | null) {
        // Optimistic update
        setTransactions((prev) =>
            prev.map((t) => (t.id === txnId ? { ...t, category_id: categoryId } : t))
        );
        try {
            const updated = await updateTransaction(txnId, { category_id: categoryId });
            setTransactions((prev) =>
                prev.map((t) => (t.id === txnId ? { ...t, ...updated } : t))
            );
        } catch (err) {
            console.error('Failed to update category:', err);
            // Revert on error would be ideal but skipping for simplicity
        }
    }

    async function handleBulkCategorize(categoryId: number) {
        if (selectedIds.size === 0) return;

        // Optimistic
        setTransactions(prev => prev.map(t => selectedIds.has(t.id) ? { ...t, category_id: categoryId } : t));

        try {
            await bulkCategorize(Array.from(selectedIds), categoryId);
            loadData(); // Reload to be sure
        } catch (err) {
            console.error('Failed to bulk categorize:', err);
        }
    }

    async function handleApprove(txnId: number) {
        try {
            const updated = await approveTransaction(txnId);
            setTransactions((prev) =>
                prev.map((t) => (t.id === txnId ? { ...t, ...updated } : t))
            );
        } catch (err) {
            console.error('Failed to approve:', err);
        }
    }

    async function handleNeedsReview(txnId: number, needsReview: boolean) {
        try {
            const updated = await updateTransaction(txnId, { needs_review: needsReview });
            setTransactions((prev) =>
                prev.map((t) => (t.id === txnId ? { ...t, ...updated } : t))
            );
        } catch (err) {
            console.error('Failed to update needs review:', err);
        }
    }

    function toggleSelect(id: number) {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    function toggleSelectAll() {
        if (selectedIds.size === transactions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(transactions.map((t) => t.id)));
        }
    }

    return (
        <div className="p-6 lg:p-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Transactions</h1>
                    <p className="text-muted-foreground mt-1">
                        {total} transactions • {formatCurrency(totalAmount)} total
                    </p>
                </div>
            </div>

            {/* Filters */}
            <Card className="mb-6">
                <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Search */}
                        <div className="relative flex-1 min-w-[240px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                                type="text"
                                placeholder="Search transactions..."
                                value={filters.search || ''}
                                onChange={(e) => updateFilter('search', e.target.value || null)}
                                className="pl-9"
                            />
                        </div>

                        {/* Filters toggle */}
                        <Button
                            variant={showFilters ? "secondary" : "outline"}
                            onClick={() => setShowFilters((prev) => !prev)}
                            className="gap-2"
                        >
                            <Filter className="w-4 h-4" />
                            Filters
                            {activeFiltersCount > 0 && (
                                <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                                    {activeFiltersCount}
                                </Badge>
                            )}
                        </Button>

                        <Button
                            variant={filters.needs_review ? "default" : "outline"}
                            onClick={() =>
                                updateFilter('needs_review', filters.needs_review ? null : 'true')
                            }
                            className={clsx(
                                "gap-2",
                                filters.needs_review && "bg-warning/15 text-warning hover:bg-warning/25 border-warning/30"
                            )}
                        >
                            <ListFilter className="w-4 h-4" />
                            <span className="hidden sm:inline">Needs review</span>
                        </Button>

                        {/* Clear filters */}
                        {(filters.search || filters.category_id || filters.needs_review || filters.start_date || filters.end_date) && (
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    const newParams = new URLSearchParams();
                                    if (filters.statement_id !== undefined) {
                                        newParams.set('statement_id', String(filters.statement_id));
                                    }
                                    newParams.set('page', '1');
                                    newParams.set('page_size', String(filters.page_size));
                                    setSearchParams(newParams);
                                }}
                                className="gap-1 text-muted-foreground hover:text-foreground"
                            >
                                <X className="w-4 h-4" />
                                Clear
                            </Button>
                        )}
                    </div>

                    {showFilters && (
                        <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Category
                                </label>
                                <Select
                                    value={filters.category_id?.toString() ?? "all"}
                                    onValueChange={(val) => updateFilter('category_id', val === "all" ? null : val)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="All categories" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All categories</SelectItem>
                                        <SelectItem value="0">Uncategorized</SelectItem>
                                        {categories.map((cat) => (
                                            <SelectItem key={cat.id} value={cat.id.toString()}>
                                                {cat.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Start Date
                                </label>
                                <Input
                                    type="date"
                                    value={filters.start_date || ''}
                                    onChange={(e) => updateFilter('start_date', e.target.value || null)}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    End Date
                                </label>
                                <Input
                                    type="date"
                                    value={filters.end_date || ''}
                                    onChange={(e) => updateFilter('end_date', e.target.value || null)}
                                />
                            </div>

                            <div className="flex items-center pt-6">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="needs-review-check"
                                        checked={filters.needs_review === true}
                                        onCheckedChange={(checked) =>
                                            updateFilter('needs_review', checked === true ? 'true' : null)
                                        }
                                    />
                                    <label
                                        htmlFor="needs-review-check"
                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                        Only show items needing review
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-top-2">
                    <span className="text-primary font-medium text-sm">
                        {selectedIds.size} selected
                    </span>
                    <div className="w-[200px]">
                        <Select
                            onValueChange={(val) => {
                                handleBulkCategorize(parseInt(val, 10));
                            }}
                        >
                            <SelectTrigger className="h-9 bg-background">
                                <SelectValue placeholder="Set category..." />
                            </SelectTrigger>
                            <SelectContent>
                                {categories.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id.toString()}>
                                        {cat.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedIds(new Set())}
                        className="text-primary hover:text-primary hover:bg-primary/10"
                    >
                        Clear selection
                    </Button>
                </div>
            )}

            {/* Table */}
            {loading && transactions.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
            ) : transactions.length === 0 ? (
                <Card className="border-dashed p-12 text-center">
                    <Filter className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                        No transactions found
                    </h3>
                    <p className="text-muted-foreground">
                        Try adjusting your filters or upload a statement.
                    </p>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-12">
                                        <Checkbox
                                            checked={selectedIds.size === transactions.length}
                                            onCheckedChange={() => toggleSelectAll()}
                                            aria-label="Select all"
                                        />
                                    </TableHead>
                                    <TableHead className="w-12 text-center">#</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="w-[240px]">Category</TableHead>
                                    <TableHead>Amount</TableHead>
                                    <TableHead>Review</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transactions.map((txn, index) => {
                                    return (
                                        <TableRow
                                            key={txn.id}
                                            className={clsx(
                                                selectedIds.has(txn.id) && "bg-primary/5 hover:bg-primary/10"
                                            )}
                                        >
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedIds.has(txn.id)}
                                                    onCheckedChange={() => toggleSelect(txn.id)}
                                                    aria-label={`Select transaction ${txn.id}`}
                                                />
                                            </TableCell>
                                            <TableCell className="text-center text-xs text-muted-foreground">
                                                {(filters.page - 1) * filters.page_size + index + 1}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-muted-foreground">
                                                {format(new Date(txn.posted_date), 'MMM d, yyyy')}
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium truncate max-w-[300px]" title={txn.merchant_normalized || txn.description}>
                                                    {txn.merchant_normalized || txn.description}
                                                </div>
                                                {txn.merchant_normalized && txn.merchant_normalized !== txn.description && (
                                                    <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                                                        {txn.description}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Select
                                                    value={txn.category_id?.toString() ?? "uncategorized"}
                                                    onValueChange={(val) =>
                                                        handleCategoryChange(
                                                            txn.id,
                                                            val === "uncategorized" ? null : parseInt(val, 10)
                                                        )
                                                    }
                                                >
                                                    <SelectTrigger className="h-8 text-xs">
                                                        <SelectValue placeholder="Uncategorized" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="uncategorized">
                                                            <span className="text-muted-foreground">Uncategorized</span>
                                                        </SelectItem>
                                                        {categories.map((cat) => (
                                                            <SelectItem key={cat.id} value={cat.id.toString()}>
                                                                <div className="flex items-center gap-2">
                                                                    <div
                                                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                                                        style={{ backgroundColor: cat.color }}
                                                                    />
                                                                    <span>{cat.name}</span>
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </TableCell>
                                            <TableCell className="font-mono font-medium">
                                                <span className={txn.amount >= 0 ? 'text-destructive' : 'text-success'}>
                                                    {txn.amount >= 0 ? '-' : '+'}
                                                    {formatCurrency(Math.abs(txn.amount))}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                {txn.needs_review ? (
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="secondary" className="bg-warning/15 text-warning hover:bg-warning/15 border-warning/30 gap-1 px-2 whitespace-nowrap">
                                                            <AlertCircle className="w-3 h-3" />
                                                            Review
                                                        </Badge>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 text-success hover:text-success hover:bg-success/10"
                                                            onClick={() => handleApprove(txn.id)}
                                                            title="Approve"
                                                        >
                                                            <CheckCircle className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 group">
                                                        <Badge variant="outline" className="text-success border-success/30 bg-success/10 whitespace-nowrap">
                                                            Approved
                                                        </Badge>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => handleNeedsReview(txn.id, true)}
                                                            title="Flag for review"
                                                        >
                                                            <Flag className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </Card>
            )}

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                    Showing {pageStart}-{pageEnd} of {total}
                </div>
                <div className="flex items-center gap-2">
                    <Select
                        value={String(filters.page_size)}
                        onValueChange={(val) => {
                            const newParams = new URLSearchParams(searchParams);
                            newParams.set('page_size', val);
                            newParams.set('page', '1');
                            setSearchParams(newParams);
                        }}
                    >
                        <SelectTrigger className="h-9 w-[120px]">
                            <SelectValue placeholder="Rows" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="25">25 / page</SelectItem>
                            <SelectItem value="50">50 / page</SelectItem>
                            <SelectItem value="100">100 / page</SelectItem>
                            <SelectItem value="200">200 / page</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button
                        variant="outline"
                        size="sm"
                        disabled={filters.page <= 1}
                        onClick={() => updateFilter('page', String(filters.page - 1), { resetPage: false })}
                    >
                        Previous
                    </Button>
                    <div className="text-sm text-muted-foreground min-w-[90px] text-center">
                        Page {filters.page} / {totalPages}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={filters.page >= totalPages}
                        onClick={() => updateFilter('page', String(filters.page + 1), { resetPage: false })}
                    >
                        Next
                    </Button>
                </div>
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
