import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, X, Check, RefreshCw } from 'lucide-react';
import { getCategories, createCategory, updateCategory, deleteCategory, importPlaidCategories } from '../api/client';
import type { Category } from '../types';
import clsx from 'clsx';

const PRESET_COLORS = [
    '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
    '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1',
    '#8B5CF6', '#A855F7', '#D946EF', '#EC4899', '#6B7280',
];

export default function Categories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('#6B7280');
    const [showNew, setShowNew] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState('#6B7280');

    useEffect(() => {
        loadCategories();
    }, []);

    async function loadCategories() {
        try {
            setLoading(true);
            const data = await getCategories();
            setCategories(data.categories);
        } catch (err) {
            console.error('Failed to load categories:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleCreate() {
        if (!newName.trim()) return;

        try {
            const created = await createCategory({
                name: newName.trim(),
                color: newColor,
            });
            setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
            setShowNew(false);
            setNewName('');
            setNewColor('#6B7280');
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to create category');
        }
    }

    async function handleImportPlaid() {
        if (!confirm('This will DELETE all existing categories/rules and reset transactions to "Uncategorized", replacing them with the standard Plaid taxonomy. It will also REPROCESS all statements. Are you sure?')) {
            return;
        }

        try {
            setLoading(true);
            await importPlaidCategories(true, true);
            await loadCategories();
            alert('Import complete. Statements are being re-processed in the background.');
        } catch (err) {
            console.error('Failed to import Plaid categories:', err);
            alert('Import failed. Check console.');
        } finally {
            setLoading(false);
        }
    }

    async function handleUpdate(id: number) {
        if (!editName.trim()) return;

        try {
            const updated = await updateCategory(id, {
                name: editName.trim(),
                color: editColor,
            });
            setCategories((prev) =>
                prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name))
            );
            setEditingId(null);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to update category');
        }
    }

    async function handleDelete(id: number) {
        const cat = categories.find((c) => c.id === id);
        if (!cat) return;

        if (cat.is_default) {
            alert('Cannot delete default categories');
            return;
        }

        if (!confirm(`Delete "${cat.name}"? Transactions will be uncategorized.`)) return;

        try {
            await deleteCategory(id);
            setCategories((prev) => prev.filter((c) => c.id !== id));
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to delete category');
        }
    }

    function startEdit(cat: Category) {
        setEditingId(cat.id);
        setEditName(cat.name);
        setEditColor(cat.color);
    }

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-8 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-semibold text-foreground">Categories</h1>
                <div className="flex gap-3">
                    <button
                        onClick={handleImportPlaid}
                        className="btn btn-secondary px-4 py-2.5 gap-2"
                        title="Import Plaid Taxonomy (Resets DB)"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Import Plaid
                    </button>
                    <button
                        onClick={() => setShowNew(true)}
                        className="btn btn-primary px-4 py-2.5 gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Add Category
                    </button>
                </div>
            </div>

            {/* New category form */}
            {showNew && (
                <div className="bg-card rounded-xl border border-border p-4 mb-6 shadow-sm animate-fade-in">
                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Category name"
                                className="input"
                                autoFocus
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            {PRESET_COLORS.slice(0, 8).map((color) => (
                                <button
                                    key={color}
                                    onClick={() => setNewColor(color)}
                                    className={clsx(
                                        'w-6 h-6 rounded-full transition-all duration-200',
                                        newColor === color && 'ring-2 ring-offset-2 ring-ring scale-110'
                                    )}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                        <button
                            onClick={handleCreate}
                            className="btn btn-ghost p-2 text-success hover:bg-success/10"
                        >
                            <Check className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => {
                                setShowNew(false);
                                setNewName('');
                            }}
                            className="btn btn-ghost p-2 text-muted-foreground"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Categories list */}
            <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-border bg-muted/50">
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Category
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Transactions
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Total Spent
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {categories.map((cat) => (
                            <tr key={cat.id} className="table-row-hover">
                                <td className="px-6 py-4">
                                    {editingId === cat.id ? (
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="text"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="flex-1 px-2 py-1 border border-input rounded-md bg-background focus:ring-2 focus:ring-ring"
                                                autoFocus
                                            />
                                            <div className="flex items-center gap-1">
                                                {PRESET_COLORS.slice(0, 6).map((color) => (
                                                    <button
                                                        key={color}
                                                        onClick={() => setEditColor(color)}
                                                        className={clsx(
                                                            'w-5 h-5 rounded-full transition-all duration-200',
                                                            editColor === color && 'ring-2 ring-offset-1 ring-ring scale-110'
                                                        )}
                                                        style={{ backgroundColor: color }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-4 h-4 rounded-full"
                                                style={{ backgroundColor: cat.color }}
                                            />
                                            <span className="font-medium text-foreground">{cat.name}</span>
                                            {cat.is_default && (
                                                <span className="badge badge-secondary">
                                                    Default
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right text-muted-foreground">
                                    {cat.transaction_count}
                                </td>
                                <td className="px-6 py-4 text-right font-semibold text-foreground">
                                    {formatCurrency(cat.total_amount)}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    {editingId === cat.id ? (
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => handleUpdate(cat.id)}
                                                className="btn btn-ghost p-2 text-success hover:bg-success/10"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="btn btn-ghost p-2 text-muted-foreground"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => startEdit(cat)}
                                                className="btn btn-ghost p-2 text-muted-foreground hover:text-primary"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            {!cat.is_default && (
                                                <button
                                                    onClick={() => handleDelete(cat.id)}
                                                    className="btn btn-ghost p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
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
