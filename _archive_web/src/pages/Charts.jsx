import React, { useState, useMemo } from 'react';
import { Pie, Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler } from 'chart.js';
import { useApp } from '../context/AppContext';
import { getDateRange, filterTransactionsByDateRange, groupByCategory, navigateDate, formatCurrency } from '../utils/helpers';
import { getCategoryById, spendingCategories, incomeCategories } from '../utils/categories';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval, startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler);

// Chart.js global defaults for dark theme
ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.06)';

export default function Charts() {
    const { transactions } = useApp();
    const [period, setPeriod] = useState('monthly');
    const [refDate, setRefDate] = useState(new Date());
    const [chartView, setChartView] = useState('spending'); // spending | income | comparison

    const range = getDateRange(period, refDate);
    const filtered = useMemo(() => filterTransactionsByDateRange(transactions, range.start, range.end), [transactions, range]);

    const spending = filtered.filter(t => t.type === 'spending');
    const income = filtered.filter(t => t.type === 'income');

    const totalSpending = spending.reduce((s, t) => s + t.amount, 0);
    const totalIncome = income.reduce((s, t) => s + t.amount, 0);

    // Spending by category
    const spendingByCategory = useMemo(() => {
        const grouped = groupByCategory(spending);
        return Object.entries(grouped)
            .map(([cat, data]) => ({ ...getCategoryById(cat, 'spending'), ...data }))
            .sort((a, b) => b.total - a.total);
    }, [spending]);

    // Income by category
    const incomeByCategory = useMemo(() => {
        const grouped = groupByCategory(income);
        return Object.entries(grouped)
            .map(([cat, data]) => ({ ...getCategoryById(cat, 'income'), ...data }))
            .sort((a, b) => b.total - a.total);
    }, [income]);

    // Pie Chart Data
    const displayData = chartView === 'income' ? incomeByCategory : spendingByCategory;
    const displayTotal = chartView === 'income' ? totalIncome : totalSpending;

    const pieData = {
        labels: displayData.map(d => d.name),
        datasets: [{
            data: displayData.map(d => d.total),
            backgroundColor: displayData.map(d => d.color),
            borderWidth: 0,
            spacing: 2,
        }],
    };

    const pieOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1a1f35',
                titleColor: '#f1f5f9',
                bodyColor: '#94a3b8',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
                callbacks: { label: (ctx) => ` ${ctx.label}: $${ctx.parsed.toFixed(2)}` },
            },
        },
        cutout: '60%',
    };

    // Trend data - daily spending over the period
    const trendData = useMemo(() => {
        let intervals;
        if (period === 'monthly') {
            intervals = eachDayOfInterval({ start: range.start, end: range.end });
        } else if (period === 'weekly') {
            intervals = eachDayOfInterval({ start: range.start, end: range.end });
        } else {
            // For daily, show hourly breakdown
            intervals = Array.from({ length: 24 }, (_, i) => {
                const d = new Date(refDate);
                d.setHours(i, 0, 0, 0);
                return d;
            });
        }

        const labels = intervals.map(d => period === 'daily' ? format(d, 'HH:mm') : format(d, 'dd'));
        const spendingData = intervals.map(d => {
            const dayStart = period === 'daily' ? new Date(new Date(d).setMinutes(0, 0, 0)) : startOfDay(d);
            const dayEnd = period === 'daily' ? new Date(new Date(d).setMinutes(59, 59, 999)) : endOfDay(d);
            return filterTransactionsByDateRange(spending, dayStart, dayEnd).reduce((s, t) => s + t.amount, 0);
        });
        const incomeData = intervals.map(d => {
            const dayStart = period === 'daily' ? new Date(new Date(d).setMinutes(0, 0, 0)) : startOfDay(d);
            const dayEnd = period === 'daily' ? new Date(new Date(d).setMinutes(59, 59, 999)) : endOfDay(d);
            return filterTransactionsByDateRange(income, dayStart, dayEnd).reduce((s, t) => s + t.amount, 0);
        });

        return {
            labels,
            datasets: [
                {
                    label: 'Spending',
                    data: spendingData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                },
                {
                    label: 'Income',
                    data: incomeData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                },
            ],
        };
    }, [spending, income, period, range, refDate]);

    const lineOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
            tooltip: {
                backgroundColor: '#1a1f35',
                titleColor: '#f1f5f9',
                bodyColor: '#94a3b8',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 10 } } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 10 }, callback: v => `$${v}` } },
        },
    };

    // Bar chart - income vs spending comparison
    const barData = {
        labels: ['Income', 'Spending'],
        datasets: [{
            data: [totalIncome, totalSpending],
            backgroundColor: ['rgba(16, 185, 129, 0.7)', 'rgba(239, 68, 68, 0.7)'],
            borderRadius: 8,
            borderSkipped: false,
        }],
    };

    const barOptions = {
        responsive: true,
        maintainAspectRatio: true,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1f35', titleColor: '#f1f5f9', bodyColor: '#94a3b8', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1 } },
        scales: {
            x: { grid: { display: false } },
            y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { callback: v => `$${v}` } },
        },
    };

    const handlePrev = () => setRefDate(navigateDate(refDate, period, 'prev'));
    const handleNext = () => setRefDate(navigateDate(refDate, period, 'next'));

    const getPeriodLabel = () => {
        switch (period) {
            case 'daily': return format(refDate, 'EEE, MMM dd yyyy');
            case 'weekly': return `${format(range.start, 'MMM dd')} - ${format(range.end, 'MMM dd')}`;
            case 'monthly': return format(refDate, 'MMMM yyyy');
            default: return '';
        }
    };

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

            {/* Date Nav */}
            <div className="period-selector">
                <button className="period-nav-btn" onClick={handlePrev}><ChevronLeft size={16} /></button>
                <span className="period-label">{getPeriodLabel()}</span>
                <button className="period-nav-btn" onClick={handleNext}><ChevronRight size={16} /></button>
            </div>

            {/* Quick Summary */}
            <div style={{ display: 'flex', gap: '10px', padding: '0 16px', marginBottom: '16px' }}>
                <div style={{ flex: 1, padding: '10px', background: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--accent-emerald)', fontWeight: 600 }}>INCOME</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{formatCurrency(totalIncome)}</div>
                </div>
                <div style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.1)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--accent-red)', fontWeight: 600 }}>SPENDING</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{formatCurrency(totalSpending)}</div>
                </div>
            </div>

            {/* Chart View Toggle */}
            <div className="filter-chips" style={{ marginBottom: '16px' }}>
                <button className={`filter-chip ${chartView === 'spending' ? 'active' : ''}`} onClick={() => setChartView('spending')}>
                    Spending
                </button>
                <button className={`filter-chip ${chartView === 'income' ? 'active' : ''}`} onClick={() => setChartView('income')}>
                    Income
                </button>
                <button className={`filter-chip ${chartView === 'comparison' ? 'active' : ''}`} onClick={() => setChartView('comparison')}>
                    Comparison
                </button>
            </div>

            {/* Pie Chart */}
            {chartView !== 'comparison' && (
                <div className="chart-container">
                    <h3>{chartView === 'spending' ? '💸 Spending' : '💰 Income'} by Category</h3>
                    {displayData.length === 0 ? (
                        <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            No data for this period
                        </div>
                    ) : (
                        <>
                            <div style={{ maxWidth: '220px', margin: '0 auto', position: 'relative' }}>
                                <Pie data={pieData} options={pieOptions} />
                                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Total</div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{formatCurrency(displayTotal)}</div>
                                </div>
                            </div>
                            {/* Category breakdown */}
                            <div className="category-list" style={{ marginTop: '16px' }}>
                                {displayData.map(cat => (
                                    <div key={cat.id} className="category-item">
                                        <div className="category-dot" style={{ background: cat.color }} />
                                        <div className="category-info">
                                            <div className="cat-name">{cat.icon} {cat.name}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div className="category-amount">{formatCurrency(cat.total)}</div>
                                            <div className="category-pct">
                                                {displayTotal > 0 ? ((cat.total / displayTotal) * 100).toFixed(1) : 0}%
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Bar Chart (comparison) */}
            {chartView === 'comparison' && (
                <div className="chart-container">
                    <h3>📊 Income vs Spending</h3>
                    <Bar data={barData} options={barOptions} />
                </div>
            )}

            {/* Trend Line */}
            <div className="chart-container">
                <h3>📈 Spending Trend</h3>
                <Line data={trendData} options={lineOptions} />
            </div>
        </div>
    );
}
