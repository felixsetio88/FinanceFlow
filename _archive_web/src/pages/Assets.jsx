import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatCurrency } from '../utils/helpers';
import { accountTypes, getAccountTypeById } from '../utils/categories';
import Modal from '../components/Modal';
import { Plus, Trash2, Edit3, ArrowLeftRight, Wallet } from 'lucide-react';

export default function Assets() {
    const { assets, addAsset, updateAsset, deleteAsset } = useApp();
    const [showAdd, setShowAdd] = useState(false);
    const [showTransfer, setShowTransfer] = useState(false);
    const [editAsset, setEditAsset] = useState(null);
    const [form, setForm] = useState({ name: '', type: 'bank', balance: '' });
    const [transferForm, setTransferForm] = useState({ fromId: '', toId: '', amount: '' });

    const totalBalance = assets.reduce((sum, a) => sum + a.balance, 0);

    const handleSave = async () => {
        const balance = parseFloat(form.balance) || 0;
        if (!form.name.trim()) return;

        if (editAsset) {
            await updateAsset({ ...editAsset, name: form.name, type: form.type, balance });
        } else {
            await addAsset({ name: form.name, type: form.type, balance });
        }
        setForm({ name: '', type: 'bank', balance: '' });
        setShowAdd(false);
        setEditAsset(null);
    };

    const handleEdit = (asset) => {
        setEditAsset(asset);
        setForm({ name: asset.name, type: asset.type, balance: asset.balance.toString() });
        setShowAdd(true);
    };

    const handleDelete = async (id) => {
        await deleteAsset(id);
    };

    const handleTransfer = async () => {
        const amount = parseFloat(transferForm.amount);
        if (!amount || amount <= 0 || !transferForm.fromId || !transferForm.toId) return;
        if (transferForm.fromId === transferForm.toId) return;

        const fromAsset = assets.find(a => a.id === transferForm.fromId);
        const toAsset = assets.find(a => a.id === transferForm.toId);
        if (!fromAsset || !toAsset) return;

        await updateAsset({ ...fromAsset, balance: fromAsset.balance - amount });
        await updateAsset({ ...toAsset, balance: toAsset.balance + amount });

        setTransferForm({ fromId: '', toId: '', amount: '' });
        setShowTransfer(false);
    };

    const getTypeIcon = (typeId) => {
        const t = accountTypes.find(a => a.id === typeId);
        return t ? t.icon : '📋';
    };

    return (
        <div className="animate-fade-in">
            {/* Net Worth Card */}
            <div className="net-worth-card">
                <div className="nw-label">
                    <Wallet size={14} style={{ display: 'inline', marginRight: '4px' }} />
                    Total Assets
                </div>
                <div className="nw-amount">{formatCurrency(totalBalance)}</div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '10px', padding: '0 16px', marginBottom: '16px' }}>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => { setEditAsset(null); setForm({ name: '', type: 'bank', balance: '' }); setShowAdd(true); }}>
                    <Plus size={14} /> Add Account
                </button>
                {assets.length >= 2 && (
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setShowTransfer(true)}>
                        <ArrowLeftRight size={14} /> Transfer
                    </button>
                )}
            </div>

            {/* Asset List */}
            {assets.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-icon">🏦</div>
                    <div className="empty-title">No accounts yet</div>
                    <div className="empty-desc">Add your bank accounts, cash, PayPal, or other assets to track your wealth</div>
                </div>
            ) : (
                assets.map(asset => (
                    <div key={asset.id} className="asset-card" onClick={() => handleEdit(asset)}>
                        <div className="asset-icon">
                            {getTypeIcon(asset.type)}
                        </div>
                        <div className="asset-info">
                            <div className="asset-name">{asset.name}</div>
                            <div className="asset-type">{getAccountTypeById(asset.type).name}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div className="asset-balance" style={{ color: asset.balance >= 0 ? 'var(--accent-emerald)' : 'var(--accent-red)' }}>
                                {formatCurrency(asset.balance)}
                            </div>
                            <button
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '4px', color: 'var(--accent-red)', marginTop: '4px' }}
                                onClick={(e) => { e.stopPropagation(); handleDelete(asset.id); }}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>
                ))
            )}

            {/* Add/Edit Asset Modal */}
            <Modal
                isOpen={showAdd}
                onClose={() => { setShowAdd(false); setEditAsset(null); }}
                title={editAsset ? 'Edit Account' : 'New Account'}
                footer={
                    <>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowAdd(false); setEditAsset(null); }}>Cancel</button>
                        <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave}>
                            {editAsset ? 'Update' : 'Add'} Account
                        </button>
                    </>
                }
            >
                <div className="form-group">
                    <label className="form-label">Account Name</label>
                    <input
                        className="form-input"
                        placeholder="e.g. My Savings"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">Account Type</label>
                    <div className="category-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        {accountTypes.map(acc => (
                            <button
                                key={acc.id}
                                className={`category-option ${form.type === acc.id ? 'selected' : ''}`}
                                onClick={() => setForm({ ...form, type: acc.id })}
                            >
                                <span className="cat-emoji">{acc.icon}</span>
                                <span className="cat-label">{acc.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Current Balance ($)</label>
                    <input
                        type="number"
                        className="form-input"
                        placeholder="0.00"
                        value={form.balance}
                        onChange={(e) => setForm({ ...form, balance: e.target.value })}
                        step="0.01"
                        style={{ fontSize: '1.2rem', fontWeight: 700, textAlign: 'center' }}
                    />
                </div>
            </Modal>

            {/* Transfer Modal */}
            <Modal
                isOpen={showTransfer}
                onClose={() => setShowTransfer(false)}
                title="Transfer Between Accounts"
                footer={
                    <>
                        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowTransfer(false)}>Cancel</button>
                        <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleTransfer}>Transfer</button>
                    </>
                }
            >
                <div className="form-group">
                    <label className="form-label">From Account</label>
                    <select className="form-select" value={transferForm.fromId} onChange={(e) => setTransferForm({ ...transferForm, fromId: e.target.value })}>
                        <option value="">Select account</option>
                        {assets.map(a => (
                            <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                        ))}
                    </select>
                </div>

                <div style={{ textAlign: 'center', padding: '8px', color: 'var(--text-muted)' }}>
                    <ArrowLeftRight size={20} />
                </div>

                <div className="form-group">
                    <label className="form-label">To Account</label>
                    <select className="form-select" value={transferForm.toId} onChange={(e) => setTransferForm({ ...transferForm, toId: e.target.value })}>
                        <option value="">Select account</option>
                        {assets.map(a => (
                            <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Amount ($)</label>
                    <input
                        type="number"
                        className="form-input"
                        placeholder="0.00"
                        value={transferForm.amount}
                        onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                        step="0.01"
                        min="0"
                        style={{ fontSize: '1.2rem', fontWeight: 700, textAlign: 'center' }}
                    />
                </div>
            </Modal>
        </div>
    );
}
