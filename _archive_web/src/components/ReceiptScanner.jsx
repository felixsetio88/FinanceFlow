import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { Camera, Upload, Sparkles, Loader } from 'lucide-react';
import { autoCategorize } from '../utils/categories';

export default function ReceiptScanner({ onResults, onClose }) {
    const [scanning, setScanning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusText, setStatusText] = useState('');
    const [results, setResults] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const fileRef = useRef();

    const parseReceiptText = (text) => {
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        const items = [];

        // Try to find price patterns like "$12.34" or "12.34" or "12,34"
        const pricePattern = /\$?\s*(\d+[.,]\d{2})\s*$/;
        const qtyPricePattern = /(\d+)\s*[xX@]\s*\$?\s*(\d+[.,]\d{2})/;

        for (const line of lines) {
            // Skip header/footer lines that typically contain store info
            const lower = line.toLowerCase();
            if (lower.includes('total') || lower.includes('subtotal') || lower.includes('tax') ||
                lower.includes('change') || lower.includes('cash') || lower.includes('card') ||
                lower.includes('thank') || lower.includes('receipt') || lower.includes('tel') ||
                lower.includes('phone') || lower.includes('address') || lower.includes('date') ||
                lower.includes('time') || lower.includes('visa') || lower.includes('mastercard')) {
                continue;
            }

            // Try to match quantity x price pattern first
            const qtyMatch = line.match(qtyPricePattern);
            if (qtyMatch) {
                const qty = parseInt(qtyMatch[1]);
                const unitPrice = parseFloat(qtyMatch[2].replace(',', '.'));
                const name = line.replace(qtyPricePattern, '').replace(pricePattern, '').trim();
                if (name.length > 1) {
                    items.push({
                        name: name.substring(0, 40),
                        quantity: qty,
                        price: unitPrice,
                        total: qty * unitPrice,
                        category: autoCategorize(name),
                    });
                    continue;
                }
            }

            // Try simple price at end of line
            const priceMatch = line.match(pricePattern);
            if (priceMatch) {
                const price = parseFloat(priceMatch[1].replace(',', '.'));
                const name = line.replace(pricePattern, '').trim();
                if (name.length > 1 && price > 0 && price < 10000) {
                    items.push({
                        name: name.substring(0, 40),
                        quantity: 1,
                        price: price,
                        total: price,
                        category: autoCategorize(name),
                    });
                }
            }
        }

        return items;
    };

    const handleScan = async (file) => {
        if (!file) return;

        setPreviewUrl(URL.createObjectURL(file));
        setScanning(true);
        setProgress(0);
        setStatusText('Initializing OCR engine...');

        try {
            const worker = await createWorker('eng', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        setProgress(Math.round(m.progress * 100));
                        setStatusText('Reading receipt...');
                    }
                },
            });

            const { data: { text } } = await worker.recognize(file);
            await worker.terminate();

            const parsedItems = parseReceiptText(text);
            setResults(parsedItems);
            setStatusText(`Found ${parsedItems.length} items`);
        } catch (err) {
            console.error('OCR Error:', err);
            setStatusText('Failed to scan receipt. Try a clearer image.');
            setResults([]);
        }

        setScanning(false);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) handleScan(file);
    };

    const handleUseResults = () => {
        if (results && results.length > 0) {
            // Determine overall category from most common category
            const categoryCounts = {};
            results.forEach(item => {
                categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
            });
            const topCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'food';

            onResults({
                items: results.map(r => ({ name: r.name, quantity: r.quantity, price: r.price })),
                category: topCategory,
                total: results.reduce((sum, r) => sum + r.total, 0),
            });
        }
    };

    return (
        <div>
            {!previewUrl && !scanning && !results && (
                <div className="scanner-area" onClick={() => fileRef.current?.click()}>
                    <div className="scanner-icon">📸</div>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '6px' }}>
                        Scan Receipt
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Take a photo or upload an image of your receipt
                    </p>
                    <div style={{ marginTop: '16px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button className="btn btn-sm btn-primary">
                            <Camera size={14} /> Camera
                        </button>
                        <button className="btn btn-sm btn-secondary">
                            <Upload size={14} /> Upload
                        </button>
                    </div>
                </div>
            )}

            {previewUrl && (
                <div style={{ marginBottom: '16px', borderRadius: 'var(--radius-md)', overflow: 'hidden', maxHeight: '200px' }}>
                    <img src={previewUrl} alt="Receipt" style={{ width: '100%', objectFit: 'cover' }} />
                </div>
            )}

            {scanning && (
                <div className="scanner-progress">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Loader size={16} className="loading-spinner" style={{ border: 'none', width: 'auto', height: 'auto', animation: 'spin 1s linear infinite' }} />
                        <span className="progress-text">{statusText}</span>
                    </div>
                    <div className="progress-bar">
                        <div className="progress-fill green" style={{ width: `${progress}%` }} />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{progress}%</span>
                </div>
            )}

            {results && !scanning && (
                <div className="receipt-items">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                            <Sparkles size={14} style={{ display: 'inline', marginRight: '4px' }} />
                            Detected Items
                        </h4>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{results.length} items</span>
                    </div>

                    {results.length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            No items detected. Try a clearer image.
                        </div>
                    ) : (
                        <>
                            {results.map((item, i) => (
                                <div key={i} className="receipt-item">
                                    <span className="ri-name">
                                        {item.quantity > 1 && `${item.quantity}x `}{item.name}
                                    </span>
                                    <span className="ri-price">${item.total.toFixed(2)}</span>
                                </div>
                            ))}
                            <div className="items-total">
                                <span className="total-label">Total</span>
                                <span className="total-amount">
                                    ${results.reduce((sum, r) => sum + r.total, 0).toFixed(2)}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                                <button className="btn btn-primary btn-full" onClick={handleUseResults}>
                                    Use These Items
                                </button>
                                <button className="btn btn-secondary" onClick={() => { setResults(null); setPreviewUrl(null); }}>
                                    Retry
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
            />
        </div>
    );
}
