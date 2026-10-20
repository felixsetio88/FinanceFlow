import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency, formatDate, formatDateTime, getDateRange, filterTransactionsByDateRange, navigateDate, groupByDate } from '../utils/helpers';
import { getCategoryById, getAccountTypeById, spendingCategories, incomeCategories } from '../utils/categories';
import TransactionCard from '../components/TransactionCard';
import { ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export default function Transactions() {
    const { transactions, deleteTransaction } = useApp();
    const [period, setPeriod] = useState('monthly');
    const [refDate, setRefDate] = useState(new Date());
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [expandedId, setExpandedId] = useState(null);

    const range = getDateRange(period, refDate);

    const filtered = useMemo(() => {
        let txs = filterTransactionsByDateRange(transactions, range.start, range.end);

        if (search) {
            const q = search.toLowerCase();
            txs = txs.filter(t =>
                (t.description || '').toLowerCase().includes(q) ||
                getCategoryById(t.category, t.type).name.toLowerCase().includes(q) ||
                (t.items || []).some(item => item.name.toLowerCase().includes(q))
            );
        }

        if (filterCategory !== 'all') {
            txs = txs.filter(t => t.category === filterCategory);
        }

        return txs;
    }, [transactions, range, search, filterCategory]);

    const grouped = useMemo(() => groupByDate(filtered), [filtered]);

    const totalIncome = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalSpending = filtered.filter(t => t.type === 'spending').reduce((s, t) => s + t.amount, 0);

    const handlePrev = () => setRefDate(navigateDate(refDate, period, 'prev'));
    const handleNext = () => setRefDate(navigateDate(refDate, period, 'next'));

    const getPeriodLabel = () => {
        switch (period) {
            case 'daily': return format(refDate, 'EEE, MMM dd yyyy');
            case 'weekly': return `${format(range.start, 'MMM dd')} - ${format(range.end, 'MMM dd, yyyy')}`;
            case 'monthly': return format(refDate, 'MMMM yyyy');
            default: return '';
        }
    };

    const handleDelete = async (id) => {
        await deleteTransaction(id);
        setExpandedId(null);
    };

    const allCategories = [...spendingCategories, ...incomeCategories];

    return (
        <div className="animate-fade-in">
            {/* Period Toggle */}
            <div style={{ padding: '12px 16px 0' }}>
                <div className="toggle-tabs">
                    {['daily', 'weekly', 'monthly'].map(p => (
                        <button
                            key={p}
                            className={`toggle-tab ${period === p ? 'active' : ''}`}
                            onClick={() => { setPeriod(p); setRefDate(new Date()); }}
                        >
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Date Navigation */}
            <div className="period-selector">
                <button className="period-nav-btn" onClick={handlePrev}>
                    <ChevronLeft size={16} />
                </button>
                <span className="period-label">{getPeriodLabel()}</span>
                <button className="period-nav-btn" onClick={handleNext}>
                    <ChevronRight size={16} />
                </button>
            </div>

            {/* Income/Spending Summary */}
            <div style={{ display: 'flex', gap: '10px', padding: '0 16px', marginBottom: '12px' }}>
                <div style={{ flex: 1, padding: '10px', background: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--accent-emerald)', fontWeight: 600, marginBottom: '4px' }}>INCOME</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{formatCurrency(totalIncome)}</div>
                </div>
                <div style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--accent-red)', fontWeight: 600, marginBottom: '4px' }}>SPENDING</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{formatCurrency(totalSpending)}</div>
                </div>
            </div>

            {/* Search */}
            <div className="search-bar">
                <Search size={16} className="search-icon" />
                <input
                    placeholder="Search transactions..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {/* Category Filter */}
            <div className="filter-chips">
                <button className={`filter-chip ${filterCategory === 'all' ? 'active' : ''}`} onClick={() => setFilterCategory('all')}>
                    All
                </button>
                {allCategories.slice(0, 8).map(cat => (
                    <button
                        key={cat.id}
                        className={`filter-chip ${filterCategory === cat.id ? 'active' : ''}`}
                        onClick={() => setFilterCategory(cat.id)}
                    >
                        {cat.icon} {cat.name}
                    </button>
                ))}
            </div>

            {/* Transaction List */}
            {Object.keys(grouped).length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <div className="empty-title">No transactions</div>
                    <div className="empty-desc">No transactions found for this period</div>
                </div>
            ) : (
                Object.entries(grouped).map(([dateKey, txs]) => (
                    <div key={dateKey}>
                        <div className="date-group-header">
                            {format(new Date(dateKey), 'EEEE, MMMM dd')}
                            <span style={{ float: 'right', color: 'var(--text-muted)' }}>
                                {txs.length} {txs.length === 1 ? 'item' : 'items'}
                            </span>
                        </div>
                        {txs.map(tx => (
                            <div key={tx.id}>
                                <TransactionCard
                                    transaction={tx}
                                    onClick={() => setExpandedId(expandedId === tx.id ? null : tx.id)}
                                />
                                {expandedId === tx.id && (
                                    <div className="transaction-detail">
                                        <div className="detail-row">
                                            <span className="detail-label">Date & Time</span>
                                            <span className="detail-value">{formatDateTime(tx.date)}</span>
                                        </div>
                                        <div className="detail-row">
                                            <span className="detail-label">Payment</span>
                                            <span className="detail-value">{getAccountTypeById(tx.accountType).name}</span>
                                        </div>
                                        {tx.description && (
                                            <div className="detail-row">
                                                <span className="detail-label">Note</span>
                                                <span className="detail-value">{tx.description}</span>
                                            </div>
                                        )}
                                        {tx.items && tx.items.length > 0 && (
                                            <div style={{ marginTop: '8px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Items:</div>
                                                {tx.items.map((item, i) => (
                                                    <div key={i} className="receipt-item">
                                                        <span className="ri-name">{item.quantity > 1 ? `${item.quantity}x ` : ''}{item.name}</span>
                                                        <span className="ri-price">${(item.quantity * item.price).toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {tx.photos && tx.photos.length > 0 && (
                                            <div className="photo-grid" style={{ marginTop: '10px' }}>
                                                {tx.photos.map((url, i) => (
                                                    <div key={i} className="photo-thumb">
                                                        <img src={url} alt={`Photo ${i + 1}`} />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <button className="btn btn-danger btn-sm btn-full" style={{ marginTop: '12px' }} onClick={() => handleDelete(tx.id)}>
                                            <Trash2 size={14} /> Delete Transaction
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ))
            )}
        </div>
    );
}
