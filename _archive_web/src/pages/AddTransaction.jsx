import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { incomeCategories, spendingCategories, accountTypes } from '../utils/categories';
import PhotoUpload from '../components/PhotoUpload';
import ReceiptScanner from '../components/ReceiptScanner';
import { Plus, Minus, Sparkles, X } from 'lucide-react';

export default function AddTransaction({ isOpen, onClose }) {
    const { addTransaction, assets } = useApp();
    const [type, setType] = useState('spending');
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [accountType, setAccountType] = useState('cash');
    const [accountId, setAccountId] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
    const [photos, setPhotos] = useState([]);
    const [items, setItems] = useState([{ name: '', quantity: 1, price: '' }]);
    const [showScanner, setShowScanner] = useState(false);

    const categories = type === 'income' ? incomeCategories : spendingCategories;

    const itemsTotal = useMemo(() => {
        return items.reduce((sum, item) => {
            const qty = parseFloat(item.quantity) || 0;
            const price = parseFloat(item.price) || 0;
            return sum + (qty * price);
        }, 0);
    }, [items]);

    const resetForm = () => {
        setAmount('');
        setCategory('');
        setAccountType('cash');
        setAccountId('');
        setDescription('');
        setDate(new Date().toISOString().slice(0, 16));
        setPhotos([]);
        setItems([{ name: '', quantity: 1, price: '' }]);
        setShowScanner(false);
    };

    const handleSubmit = async () => {
        const finalAmount = type === 'spending' && items.some(i => i.name)
            ? itemsTotal
            : parseFloat(amount);

        if (!finalAmount || finalAmount <= 0) return;
        if (!category) return;

        const transaction = {
            type,
            amount: finalAmount,
            category,
            accountType,
            accountId: accountId || null,
            description,
            date: new Date(date).toISOString(),
            photos: photos.map(p => p.url),
            items: type === 'spending' ? items.filter(i => i.name).map(i => ({
                name: i.name,
                quantity: parseFloat(i.quantity) || 1,
                price: parseFloat(i.price) || 0,
            })) : [],
        };

        await addTransaction(transaction);
        resetForm();
        onClose();
    };

    const addItem = () => {
        setItems([...items, { name: '', quantity: 1, price: '' }]);
    };

    const removeItem = (index) => {
        if (items.length === 1) return;
        setItems(items.filter((_, i) => i !== index));
    };

    const updateItem = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    };

    const handleScanResults = (scanData) => {
        setItems(scanData.items.map(i => ({
            name: i.name,
            quantity: i.quantity.toString(),
            price: i.price.toFixed(2),
        })));
        if (scanData.category) setCategory(scanData.category);
        setAmount(scanData.total.toFixed(2));
        setShowScanner(false);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) { resetForm(); onClose(); } }}>
            <div className="modal-content">
                <div className="modal-header">
                    <h2>{type === 'income' ? '💰 Add Income' : '💸 Add Expense'}</h2>
                    <button className="modal-close" onClick={() => { resetForm(); onClose(); }}>
                        <X size={16} />
                    </button>
                </div>
                <div className="modal-body">
                    {/* Type Toggle */}
                    <div className="toggle-tabs" style={{ marginBottom: '20px' }}>
                        <button
                            className={`toggle-tab ${type === 'income' ? 'active' : ''}`}
                            onClick={() => { setType('income'); setCategory(''); }}
                            style={type === 'income' ? { background: 'var(--gradient-emerald)' } : {}}
                        >
                            Income
                        </button>
                        <button
                            className={`toggle-tab ${type === 'spending' ? 'active' : ''}`}
                            onClick={() => { setType('spending'); setCategory(''); }}
                            style={type === 'spending' ? { background: 'var(--gradient-red)', boxShadow: 'var(--shadow-glow-red)' } : {}}
                        >
                            Spending
                        </button>
                    </div>

                    {/* Auto Fill (Spending only) */}
                    {type === 'spending' && (
                        <div className="form-group">
                            {showScanner ? (
                                <ReceiptScanner
                                    onResults={handleScanResults}
                                    onClose={() => setShowScanner(false)}
                                />
                            ) : (
                                <button className="autofill-btn" onClick={() => setShowScanner(true)}>
                                    <span className="ai-badge">AI</span>
                                    <Sparkles size={14} />
                                    Auto Fill from Receipt
                                </button>
                            )}
                        </div>
                    )}

                    {/* Amount */}
                    {(type === 'income' || !items.some(i => i.name)) && (
                        <div className="form-group">
                            <label className="form-label">Amount</label>
                            <input
                                type="number"
                                className="form-input"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                step="0.01"
                                min="0"
                                style={{ fontSize: '1.2rem', fontWeight: 700 }}
                            />
                        </div>
                    )}

                    {/* Category */}
                    <div className="form-group">
                        <label className="form-label">Category</label>
                        <div className="category-grid">
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    className={`category-option ${category === cat.id ? 'selected' : ''}`}
                                    onClick={() => setCategory(cat.id)}
                                >
                                    <span className="cat-emoji">{cat.icon}</span>
                                    <span className="cat-label">{cat.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Items (Spending only) */}
                    {type === 'spending' && (
                        <div className="form-group">
                            <label className="form-label">Items</label>
                            <div className="items-list">
                                {items.map((item, i) => (
                                    <div key={i} className="item-row">
                                        <input
                                            className="form-input item-name"
                                            placeholder="Item name"
                                            value={item.name}
                                            onChange={(e) => updateItem(i, 'name', e.target.value)}
                                        />
                                        <input
                                            className="form-input item-qty"
                                            type="number"
                                            placeholder="Qty"
                                            value={item.quantity}
                                            onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                                            min="1"
                                        />
                                        <input
                                            className="form-input item-price"
                                            type="number"
                                            placeholder="Price"
                                            value={item.price}
                                            onChange={(e) => updateItem(i, 'price', e.target.value)}
                                            step="0.01"
                                            min="0"
                                        />
                                        <button className="item-remove" onClick={() => removeItem(i)}>
                                            <Minus size={12} />
                                        </button>
                                    </div>
                                ))}
                                <button className="add-item-btn" onClick={addItem}>
                                    <Plus size={14} /> Add Item
                                </button>
                            </div>
                            {items.some(i => i.name) && (
                                <div className="items-total">
                                    <span className="total-label">Total</span>
                                    <span className="total-amount">${itemsTotal.toFixed(2)}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Account Type */}
                    <div className="form-group">
                        <label className="form-label">Payment Method</label>
                        <select
                            className="form-select"
                            value={accountType}
                            onChange={(e) => setAccountType(e.target.value)}
                        >
                            {accountTypes.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.icon} {acc.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Linked Asset */}
                    {assets.length > 0 && (
                        <div className="form-group">
                            <label className="form-label">Linked Account (Optional)</label>
                            <select
                                className="form-select"
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                            >
                                <option value="">None</option>
                                {assets.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Description */}
                    <div className="form-group">
                        <label className="form-label">Description</label>
                        <input
                            className="form-input"
                            placeholder="What was this for?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    {/* Date & Time */}
                    <div className="form-group">
                        <label className="form-label">Date & Time</label>
                        <input
                            type="datetime-local"
                            className="form-input"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                        />
                    </div>

                    {/* Photos */}
                    <PhotoUpload photos={photos} onChange={setPhotos} />
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={() => { resetForm(); onClose(); }} style={{ flex: 1 }}>
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        style={{ flex: 2, opacity: (!amount && !items.some(i => i.name)) || !category ? 0.5 : 1 }}
                        disabled={(!amount && !items.some(i => i.name)) || !category}
                    >
                        {type === 'income' ? 'Add Income' : 'Add Expense'}
                    </button>
                </div>
            </div>
        </div>
    );
}
