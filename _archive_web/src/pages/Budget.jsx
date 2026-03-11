import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, calculateBudgetUsage } from '../utils/helpers';
import Modal from '../components/Modal';
import { Plus, Trash2, AlertTriangle, Shield, Target } from 'lucide-react';

export default function Budget() {
    const { budgets, transactions, addBudget, updateBudget, deleteBudget } = useApp();
    const [showAdd, setShowAdd] = useState(false);
    const [editBudget, setEditBudget] = useState(null);
    const [form, setForm] = useState({ period: 'daily', amount: '' });

    const handleSave = async () => {
        const amount = parseFloat(form.amount);
        if (!amount || amount <= 0) return;

        if (editBudget) {
            await updateBudget({ ...editBudget, amount, period: form.period });
        } else {
            await addBudget({ period: form.period, amount });
        }
        setForm({ period: 'daily', amount: '' });
        setShowAdd(false);
        setEditBudget(null);
    };

    const handleEdit = (budget) => {
        setEditBudget(budget);
        setForm({ period: budget.period, amount: budget.amount.toString() });
        setShowAdd(true);
    };

    const handleDelete = async (id) => {
        await deleteBudget(id);
    };

    const budgetUsages = budgets.map(b => ({
        ...b,
        usage: calculateBudgetUsage(transactions, b),
    }));

    const getProgressColor = (pct) => {
        if (pct >= 100) return 'red';
        if (pct >= 75) return 'yellow';
        return 'green';
    };

    const getPeriodIcon = (period) => {
        switch (period) {
            case 'daily': return '📅';
            case 'weekly': return '📆';
            case 'monthly': return '🗓️';
            default: return '📅';
        }
    };

    return (
        <div className="animate-fade-in">
            {/* Header */}
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
                        <Target size={18} style={{ display: 'inline', marginRight: '6px' }} />
                        Budget Manager
                    </h2>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Set spending limits to stay on track
                    </p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => { setEditBudget(null); setForm({ period: 'daily', amount: '' }); setShowAdd(true); }}>
                    <Plus size={14} /> Add
                </button>
            </div>

            {/* Budget Cards */}
            {budgetUsages.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">🎯</div>
                    <div className="empty-title">No budgets set</div>
                    <div className="empty-desc">Set daily, weekly, or monthly spending limits to control your finances</div>
                    <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => setShowAdd(true)}>
                        <Plus size={14} /> Create Budget
                    </button>
                </div>
            ) : (
                budgetUsages.map(b => (
                    <div key={b.id} className="budget-card" style={{
                        borderColor: b.usage.isOver ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255, 255, 255, 0.06)'
                    }}>
                        <div className="budget-header">
                            <div>
                                <span style={{ fontSize: '1.2rem', marginRight: '8px' }}>{getPeriodIcon(b.period)}</span>
                                <span className="budget-type" style={{ color: b.usage.isOver ? 'var(--accent-red)' : 'var(--text-primary)' }}>
                                    {b.period} Budget
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(b)}>Edit</button>
                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-red)' }} onClick={() => handleDelete(b.id)}>
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>

                        {b.usage.isOver && (
                            <div className="alert-banner danger" style={{ margin: '0 0 10px' }}>
                                <AlertTriangle size={14} />
                                <span style={{ fontSize: '0.75rem' }}>Over budget by {formatCurrency(Math.abs(b.usage.remaining))}</span>
                            </div>
                        )}

                        <div className="progress-bar" style={{ height: '10px' }}>
                            <div
                                className={`progress-fill ${getProgressColor(b.usage.percentage)}`}
                                style={{ width: `${Math.min(b.usage.percentage, 100)}%` }}
                            />
                        </div>

                        <div className="budget-amounts">
                            <span>Spent: <strong style={{ color: b.usage.isOver ? 'var(--accent-red)' : 'var(--accent-emerald)' }}>
                                {formatCurrency(b.usage.spent)}
                            </strong></span>
                            <span>Limit: <strong>{formatCurrency(b.usage.limit)}</strong></span>
                        </div>

                        <div style={{ marginTop: '6px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {b.usage.percentage.toFixed(1)}% used
                            {!b.usage.isOver && ` · ${formatCurrency(b.usage.remaining)} remaining`}
                        </div>
                    </div>
                ))
            )}

            {/* Tips */}
            {budgetUsages.length > 0 && (
                <div style={{ margin: '20px 16px', padding: '14px', background: 'rgba(16,185,129,0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(16,185,129,0.15)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-emerald)', marginBottom: '4px' }}>
                        <Shield size={12} style={{ display: 'inline', marginRight: '4px' }} />
                        Budget Tip
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Track your daily spending first, then set realistic weekly and monthly limits based on your patterns.
                    </p>
                </div>
            )}

            {/* Add/Edit Modal */}
            <Modal
                isOpen={showAdd}
                onClose={() => { setShowAdd(false); setEditBudget(null); }}
                title={editBudget ? 'Edit Budget' : 'New Budget'}
                footer={
                    <>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowAdd(false); setEditBudget(null); }}>Cancel</button>
                        <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave}>
                            {editBudget ? 'Update' : 'Create'} Budget
                        </button>
                    </>
                }
            >
                <div className="form-group">
                    <label className="form-label">Period</label>
                    <div className="toggle-tabs">
                        {['daily', 'weekly', 'monthly'].map(p => (
                            <button
                                key={p}
                                className={`toggle-tab ${form.period === p ? 'active' : ''}`}
                                onClick={() => setForm({ ...form, period: p })}
                            >
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Budget Amount ($)</label>
                    <input
                        type="number"
                        className="form-input"
                        placeholder="0.00"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        step="0.01"
                        min="0"
                        style={{ fontSize: '1.2rem', fontWeight: 700, textAlign: 'center' }}
                    />
                </div>

                <div style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        {form.period === 'daily' && 'You will be warned when daily spending exceeds this amount'}
                        {form.period === 'weekly' && 'Budget resets every Monday'}
                        {form.period === 'monthly' && 'Budget resets on the 1st of each month'}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
