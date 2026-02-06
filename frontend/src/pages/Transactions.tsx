import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Search,
    Filter,
    CheckCircle,
    AlertCircle,
    X,
    Hash,
    Flag,
    ListFilter,
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
            search: searchParams.get('search') || undefined,
        }),
        [searchParams]
    );

    const activeFiltersCount = useMemo(() => {
        let count = 0;
        if (filters.search) count += 1;
        if (filters.category_id !== undefined) count += 1;
        if (filters.needs_review) count += 1;
        return count;
    }, [filters]);

    useEffect(() => {
        loadData();
    }, [filters]);

    async function loadData() {
        try {
            setLoading(true);
            const [txnData, catData] = await Promise.all([
                getTransactions({ ...filters, limit: 200 }),
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

    function updateFilter(key: string, value: string | null) {
        const newParams = new URLSearchParams(searchParams);
        if (value) {
            newParams.set(key, value);
        } else {
            newParams.delete(key);
        }
        setSearchParams(newParams);
    }

    async function handleCategoryChange(txnId: number, categoryId: number | null) {
        try {
            const updated = await updateTransaction(txnId, { category_id: categoryId });
            setTransactions((prev) =>
                prev.map((t) => (t.id === txnId ? { ...t, ...updated } : t))
            );
        } catch (err) {
            console.error('Failed to update category:', err);
        }
    }

    async function handleBulkCategorize(categoryId: number) {
        if (selectedIds.size === 0) return;

        try {
            await bulkCategorize(Array.from(selectedIds), categoryId);
            loadData();
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

    // Get category by ID for display
    function getCategoryInfo(categoryId: number | null) {
        if (!categoryId) return null;
        return categories.find(c => c.id === categoryId);
    }

    return (
        <div className="p-6 lg:p-8 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Transactions</h1>
                    <p className="text-muted-foreground mt-1">
                        {total} transactions • {formatCurrency(totalAmount)} total
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-card rounded-xl border border-border p-4 mb-6 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search transactions..."
                            value={filters.search || ''}
                            onChange={(e) => updateFilter('search', e.target.value || null)}
                            className="input !pl-12"
                        />
                    </div>

                    {/* Filters toggle */}
                    <button
                        onClick={() => setShowFilters((prev) => !prev)}
                        className="btn btn-secondary px-4 py-2 gap-2"
                    >
                        <Filter className="w-4 h-4" />
                        Filters
                        {activeFiltersCount > 0 && (
                            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5">
                                {activeFiltersCount}
                            </span>
                        )}
                    </button>

                    <button
                        onClick={() =>
                            updateFilter('needs_review', filters.needs_review ? null : 'true')
                        }
                        className={clsx(
                            'btn px-4 py-2 gap-2',
                            filters.needs_review
                                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                                : 'btn-secondary border border-border'
                        )}
                    >
                        <ListFilter className="w-4 h-4" />
                        Filter: Needs review
                    </button>

                    {/* Clear filters */}
                    {(filters.search || filters.category_id || filters.needs_review) && (
                        <button
                            onClick={() => setSearchParams(new URLSearchParams())}
                            className="btn btn-ghost px-3 py-2 gap-1 text-muted-foreground"
                        >
                            <X className="w-4 h-4" />
                            Clear
                        </button>
                    )}
                </div>

                {showFilters && (
                    <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                Category
                            </label>
                            <select
                                value={filters.category_id ?? ''}
                                onChange={(e) => updateFilter('category_id', e.target.value || null)}
                                className="select w-full"
                            >
                                <option value="">All categories</option>
                                <option value="0">Uncategorized</option>
                                {categories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center">
                            <label className="inline-flex items-center gap-2 text-sm text-foreground">
                                <input
                                    type="checkbox"
                                    checked={filters.needs_review === true}
                                    onChange={(e) =>
                                        updateFilter('needs_review', e.target.checked ? 'true' : null)
                                    }
                                    className="rounded border-input"
                                />
                                Only needs review
                            </label>
                        </div>
                    </div>
                )}
            </div>

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4 flex items-center gap-4 animate-fade-in">
                    <span className="text-primary font-medium">
                        {selectedIds.size} selected
                    </span>
                    <select
                        onChange={(e) => {
                            if (e.target.value) {
                                handleBulkCategorize(parseInt(e.target.value, 10));
                                e.target.value = '';
                            }
                        }}
                        className="select text-sm"
                        defaultValue=""
                    >
                        <option value="" disabled>
                            Set category...
                        </option>
                        {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                                {cat.name}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-sm text-primary hover:underline"
                    >
                        Clear selection
                    </button>
                </div>
            )}

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
            ) : transactions.length === 0 ? (
                <div className="bg-card border-2 border-dashed border-border rounded-xl p-12 text-center">
                    <Filter className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">
                        No transactions found
                    </h3>
                    <p className="text-muted-foreground">
                        Try adjusting your filters or upload a statement.
                    </p>
                </div>
            ) : (
                <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border bg-muted/50">
                                    <th className="px-4 py-3 text-left w-12">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.size === transactions.length}
                                            onChange={toggleSelectAll}
                                            className="rounded border-input"
                                        />
                                    </th>
                                    <th className="px-3 py-3 text-center w-12">
                                        <Hash className="w-4 h-4 text-muted-foreground mx-auto" />
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
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Amount
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        Review
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {transactions.map((txn, index) => {
                                    const categoryInfo = getCategoryInfo(txn.category_id);
                                    return (
                                        <tr
                                            key={txn.id}
                                            className={clsx(
                                                'table-row-hover',
                                                selectedIds.has(txn.id) && 'bg-primary/5'
                                            )}
                                        >
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(txn.id)}
                                                    onChange={() => toggleSelect(txn.id)}
                                                    className="rounded border-input"
                                                />
                                            </td>
                                            <td className="px-3 py-3 text-center">
                                                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded">
                                                    {index + 1}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-sm">
                                                {format(new Date(txn.posted_date), 'MMM d, yyyy')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-medium text-foreground truncate max-w-xs">
                                                    {txn.merchant_normalized || txn.description}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {categoryInfo && (
                                                        <div
                                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                                            style={{ backgroundColor: categoryInfo.color }}
                                                        />
                                                    )}
                                                    <select
                                                        value={txn.category_id ?? ''}
                                                        onChange={(e) =>
                                                            handleCategoryChange(
                                                                txn.id,
                                                                e.target.value ? parseInt(e.target.value, 10) : null
                                                            )
                                                        }
                                                        className="w-full px-2 py-1.5 text-sm border border-input rounded-md bg-background focus:ring-2 focus:ring-ring focus:ring-offset-1"
                                                    >
                                                        <option value="">Uncategorized</option>
                                                        {categories.map((cat) => (
                                                            <option key={cat.id} value={cat.id}>
                                                                {cat.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-left font-semibold whitespace-nowrap">
                                                <span className={txn.amount >= 0 ? 'text-red-600' : 'text-emerald-600'}>
                                                    {txn.amount >= 0 ? '-' : '+'}
                                                    {formatCurrency(Math.abs(txn.amount))}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-left">
                                                {txn.needs_review ? (
                                                    <div className="inline-flex items-center gap-3">
                                                        <span className="badge badge-warning gap-1">
                                                            <AlertCircle className="w-3 h-3" />
                                                            Needs review
                                                        </span>
                                                        <button
                                                            onClick={() => handleApprove(txn.id)}
                                                            className="btn btn-ghost px-2 py-1 gap-1 text-xs text-emerald-700 hover:bg-emerald-100"
                                                        >
                                                            <CheckCircle className="w-3.5 h-3.5" />
                                                            Approve
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="inline-flex items-center gap-2">
                                                        <span className="badge badge-success">Approved</span>
                                                        <button
                                                            onClick={() => handleNeedsReview(txn.id, true)}
                                                            className="btn btn-ghost p-1 text-amber-700 hover:bg-amber-100 rounded-md"
                                                            title="Mark transaction as needs review"
                                                            aria-label="Mark transaction as needs review"
                                                        >
                                                            <Flag className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
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
