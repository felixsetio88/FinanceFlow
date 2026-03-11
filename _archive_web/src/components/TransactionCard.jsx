import React from 'react';
import { getCategoryById } from '../utils/categories';
import { formatCurrency, formatTime } from '../utils/helpers';

export default function TransactionCard({ transaction, onClick }) {
    const cat = getCategoryById(transaction.category, transaction.type);
    const isIncome = transaction.type === 'income';

    return (
        <div className="transaction-item" onClick={() => onClick?.(transaction)}>
            <div
                className="transaction-icon"
                style={{ background: `${cat.color}20` }}
            >
                {cat.icon}
            </div>
            <div className="transaction-info">
                <div className="name">
                    {transaction.description || cat.name}
                </div>
                <div className="category">{cat.name}</div>
            </div>
            <div>
                <div className={`transaction-amount ${transaction.type}`}>
                    {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
                </div>
                <div className="transaction-time">{formatTime(transaction.date)}</div>
            </div>
        </div>
    );
}
