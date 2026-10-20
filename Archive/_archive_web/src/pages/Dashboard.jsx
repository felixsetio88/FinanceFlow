import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { formatCurrency, getDateRange, filterTransactionsByDateRange, calculateBudgetUsage, groupByCategory } from '../utils/helpers';
import { getCategoryById, spendingCategories } from '../utils/categories';
import TransactionCard from '../components/TransactionCard';
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

export default function Dashboard() {
    const { transactions, budgets } = useApp();

    const today = new Date();
    const monthRange = getDateRange('monthly', today);
    const dayRange = getDateRange('daily', today);

    const monthTransactions = useMemo(() =>
        filterTransactionsByDateRange(transactions, monthRange.start, monthRange.end),
        [transactions]
    );

    const totalIncome = useMemo(() =>
        monthTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
        [monthTransactions]
    );

    const totalSpending = useMemo(() =>
        monthTransactions.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0),
        [monthTransactions]
    );

    const balance = totalIncome - totalSpending;

    // Budget warnings
    const budgetWarnings = useMemo(() => {
        return budgets.map(b => {
            const usage = calculateBudgetUsage(transactions, b);
            return { ...b, ...usage };
        }).filter(b => b.isOver);
    }, [transactions, budgets]);

    // Recent transactions (last 5)
    const recentTransactions = useMemo(() =>
        [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5),
        [transactions]
    );

    // Top spending categories this month
    const topCategories = useMemo(() => {
        const spending = monthTransactions.filter(t => t.type === 'spending');
        const grouped = groupByCategory(spending);
        return Object.entries(grouped)
            .map(([cat, data]) => ({
                ...getCategoryById(cat, 'spending'),
                total: data.total,
                count: data.count,
                percentage: totalSpending > 0 ? (data.total / totalSpending) * 100 : 0,
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    }, [monthTransactions, totalSpending]);

    // Today's spending for mini report
    const todaySpending = useMemo(() =>
        filterTransactionsByDateRange(transactions, dayRange.start, dayRange.end)
            .filter(t => t.type === 'spending')
            .reduce((s, t) => s + t.amount, 0),
        [transactions]
    );

    return (
        <div className="animate-fade-in">
            {/* Budget Warnings */}
            {budgetWarnings.map(b => (
                <div key={b.id} className="alert-banner danger">
                    <AlertTriangle size={16} />
                    <span>
                        Over {b.period} budget! Spent {formatCurrency(b.spent)} / {formatCurrency(b.limit)}
                    </span>
                </div>
            ))}

            {/* Summary Cards */}
            <div style={{ padding: '16px 0 0' }}>
                <div className="summary-grid">
                    <div className="summary-card income animate-slide-up">
                        <div className="label">
                            <TrendingUp size={12} style={{ display: 'inline', marginRight: '4px' }} />
                            Income
                        </div>
                        <div className="amount">{formatCurrency(totalIncome)}</div>
                    </div>
                    <div className="summary-card spending animate-slide-up" style={{ animationDelay: '0.1s' }}>
                        <div className="label">
                            <TrendingDown size={12} style={{ display: 'inline', marginRight: '4px' }} />
                            Spending
                        </div>
                        <div className="amount">{formatCurrency(totalSpending)}</div>
                    </div>
                    <div className="summary-card balance animate-slide-up" style={{ animationDelay: '0.2s' }}>
                        <div className="label">Balance</div>
                        <div className="amount" style={{ color: balance >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
                            {formatCurrency(balance)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Today's Quick Stats */}
            <div style={{ margin: '0 16px 16px', padding: '12px 16px', background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Today's Spending</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: todaySpending > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                    {formatCurrency(todaySpending)}
                </span>
            </div>

            {/* Top Categories */}
            {topCategories.length > 0 && (
                <>
                    <div className="section-header">
                        <h2>Top Categories</h2>
                        <Link to="/charts" className="see-all">View Charts →</Link>
                    </div>
                    <div style={{ padding: '0 16px', marginBottom: '8px' }}>
                        <div className="category-list">
                            {topCategories.map(cat => (
                                <div key={cat.id} className="category-item">
                                    <span style={{ fontSize: '1.1rem' }}>{cat.icon}</span>
                                    <div className="category-info">
                                        <div className="cat-name">{cat.name}</div>
                                        <div className="category-percentage-bar">
                                            <div
                                                className="category-percentage-fill"
                                                style={{ width: `${cat.percentage}%`, background: cat.color }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div className="category-amount">{formatCurrency(cat.total)}</div>
                                        <div className="category-pct">{cat.percentage.toFixed(1)}%</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {/* Recent Transactions */}
            <div className="section-header">
                <h2>Recent Transactions</h2>
                <Link to="/transactions" className="see-all">See All →</Link>
            </div>

            {recentTransactions.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">📝</div>
                    <div className="empty-title">No transactions yet</div>
                    <div className="empty-desc">Tap the + button to add your first income or expense</div>
                </div>
            ) : (
                <div style={{ padding: '0 4px' }}>
                    {recentTransactions.map(tx => (
                        <TransactionCard key={tx.id} transaction={tx} />
                    ))}
                </div>
            )}
        </div>
    );
}
