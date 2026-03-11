// Category definitions for income and spending
export const spendingCategories = [
    { id: 'food', name: 'Food', icon: '🍔', color: '#ef4444' },
    { id: 'transport', name: 'Transport', icon: '🚗', color: '#f97316' },
    { id: 'daily_needs', name: 'Daily Needs', icon: '🛒', color: '#eab308' },
    { id: 'health', name: 'Health', icon: '🏥', color: '#22c55e' },
    { id: 'pets', name: 'Pets', icon: '🐾', color: '#a3e635' },
    { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#ec4899' },
    { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: '#8b5cf6' },
    { id: 'education', name: 'Education', icon: '📚', color: '#06b6d4' },
    { id: 'bills', name: 'Bills', icon: '📄', color: '#64748b' },
    { id: 'rent', name: 'Rent', icon: '🏠', color: '#0ea5e9' },
    { id: 'beauty', name: 'Beauty', icon: '💄', color: '#f43f5e' },
    { id: 'gift', name: 'Gift', icon: '🎁', color: '#d946ef' },
    { id: 'other_spending', name: 'Other', icon: '📋', color: '#94a3b8' },
];

export const incomeCategories = [
    { id: 'salary', name: 'Salary', icon: '💰', color: '#10b981' },
    { id: 'freelance', name: 'Freelance', icon: '💻', color: '#3b82f6' },
    { id: 'investment', name: 'Investment', icon: '📈', color: '#8b5cf6' },
    { id: 'gift_income', name: 'Gift', icon: '🎁', color: '#f59e0b' },
    { id: 'refund', name: 'Refund', icon: '💸', color: '#06b6d4' },
    { id: 'other_income', name: 'Other', icon: '📋', color: '#94a3b8' },
];

export const accountTypes = [
    { id: 'bank', name: 'Bank Account', icon: '🏦' },
    { id: 'cash', name: 'Cash', icon: '💵' },
    { id: 'paypal', name: 'PayPal', icon: '🅿️' },
    { id: 'ewallet', name: 'E-Wallet', icon: '📱' },
    { id: 'crypto', name: 'Crypto', icon: '₿' },
    { id: 'other_account', name: 'Other', icon: '📋' },
];

export function getCategoryById(id) {
    return (
        spendingCategories.find(c => c.id === id) ||
        incomeCategories.find(c => c.id === id) ||
        { id: 'unknown', name: 'Unknown', icon: '❓', color: '#94a3b8' }
    );
}

export function getAccountTypeById(id) {
    return accountTypes.find(a => a.id === id) || accountTypes[5];
}

// Auto-categorization keywords for AI and PDF parsing
const categoryKeywords = {
    food: ['food', 'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'sushi', 'noodle', 'rice', 'chicken', 'bread', 'milk', 'snack', 'drink', 'tea', 'juice', 'mcdonald', 'kfc', 'starbucks', 'grab food', 'gofood', 'bakery', 'makan', 'nasi', 'ayam', 'mie', 'martabak'],
    transport: ['uber', 'grab', 'gojek', 'taxi', 'bus', 'train', 'fuel', 'gas', 'petrol', 'parking', 'toll', 'mrt', 'lrt', 'bensin', 'parkir'],
    daily_needs: ['grocery', 'supermarket', 'indomaret', 'alfamart', 'soap', 'shampoo', 'tissue', 'detergent', 'toothpaste'],
    health: ['pharmacy', 'hospital', 'doctor', 'medicine', 'clinic', 'apotek', 'obat', 'vitamin'],
    shopping: ['mall', 'store', 'amazon', 'shopee', 'tokopedia', 'lazada', 'uniqlo', 'zara', 'h&m', 'clothing', 'shoes'],
    entertainment: ['movie', 'cinema', 'game', 'netflix', 'spotify', 'youtube', 'concert', 'bioskop'],
    education: ['school', 'university', 'course', 'book', 'tuition', 'udemy', 'coursera', 'buku', 'sekolah'],
    bills: ['electric', 'water', 'internet', 'phone', 'pln', 'pdam', 'telkom', 'indihome', 'listrik', 'air'],
    rent: ['rent', 'lease', 'sewa', 'kos', 'kontrakan', 'apartment'],
    beauty: ['salon', 'spa', 'cosmetic', 'skincare', 'makeup'],
    gift: ['gift', 'present', 'donation', 'charity', 'kado', 'sumbangan'],
    pets: ['pet', 'vet', 'dog', 'cat', 'food pet', 'hewan'],
};

export function autoCategorize(text) {
    const lower = (text || '').toLowerCase();
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return category;
        }
    }
    return 'other_spending';
}
