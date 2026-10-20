// Category definitions for income and spending
export const spendingCategories = [
    { id: 'food', name: 'Food', icon: 'fast-food-outline', color: '#ef4444' },
    { id: 'transport', name: 'Car', icon: 'car-outline', color: '#f97316' },
    { id: 'daily_needs', name: 'Daily Needs', icon: 'cart-outline', color: '#eab308' },
    { id: 'health', name: 'Health', icon: 'medkit-outline', color: '#22c55e' },
    { id: 'pets', name: 'Pets', icon: 'paw-outline', color: '#a3e635' },
    { id: 'shopping', name: 'Shopping', icon: 'bag-handle-outline', color: '#ec4899' },
    { id: 'entertainment', name: 'Entertainment', icon: 'ticket-outline', color: '#8b5cf6' },
    { id: 'education', name: 'Education', icon: 'library-outline', color: '#06b6d4' },
    { id: 'bills', name: 'Bills', icon: 'document-text-outline', color: '#64748b' },
    { id: 'rent', name: 'Rent', icon: 'home-outline', color: '#0ea5e9' },
    { id: 'beauty', name: 'Beauty', icon: 'color-wand-outline', color: '#f43f5e' },
    { id: 'gift', name: 'Gift', icon: 'gift-outline', color: '#d946ef' },
    { id: 'other_spending', name: 'Other', icon: 'grid-outline', color: '#94a3b8' },
];

export const incomeCategories = [
    { id: 'salary', name: 'Salary', icon: 'cash-outline', color: '#10b981' },
    { id: 'freelance', name: 'Freelance', icon: 'laptop-outline', color: '#3b82f6' },
    { id: 'investment', name: 'Investment', icon: 'trending-up-outline', color: '#8b5cf6' },
    { id: 'gift_income', name: 'Gift', icon: 'gift-outline', color: '#f59e0b' },
    { id: 'refund', name: 'Refund', icon: 'refresh-outline', color: '#06b6d4' },
    { id: 'other_income', name: 'Other', icon: 'grid-outline', color: '#94a3b8' },
];

export const accountTypes = [
    { id: 'bank', name: 'Bank Account', icon: 'business' },
    { id: 'cash', name: 'Cash', icon: 'wallet' },
    { id: 'paypal', name: 'PayPal', icon: 'logo-paypal' },
    { id: 'ewallet', name: 'E-Wallet', icon: 'phone-portrait' },
    { id: 'crypto', name: 'Crypto', icon: 'logo-bitcoin' },
    { id: 'other_account', name: 'Other', icon: 'grid' },
];

export function getCategoryById(id) {
    if (!id) return { id: 'unknown', name: 'Unknown', icon: 'help-circle-outline', color: '#94a3b8' };

    // 1. Exact match on ID
    const exact = spendingCategories.find(c => c.id === id) || incomeCategories.find(c => c.id === id);
    if (exact) return exact;

    const lower = String(id).toLowerCase().trim();

    // 2. Specific aliases: 'car' / 'transport' / 'vehicle' -> transport ('Car')
    if (lower === 'transport' || lower === 'car' || lower === 'vehicle') {
        return spendingCategories.find(c => c.id === 'transport') || { id: 'transport', name: 'Car', icon: 'car-outline', color: '#f97316' };
    }

    // 3. Case-insensitive ID match
    const byIdLower = spendingCategories.find(c => c.id.toLowerCase() === lower) ||
                      incomeCategories.find(c => c.id.toLowerCase() === lower);
    if (byIdLower) return byIdLower;

    // 4. Match by name (e.g. 'Food', 'Car', 'Daily Needs')
    const byName = spendingCategories.find(c => c.name.toLowerCase() === lower) ||
                   incomeCategories.find(c => c.name.toLowerCase() === lower);
    if (byName) return byName;

    return { id: 'unknown', name: 'Unknown', icon: 'help-circle-outline', color: '#94a3b8' };
}

export function normalizeCategoryId(id) {
    if (!id) return 'other_spending';
    const cat = getCategoryById(id);
    return cat.id !== 'unknown' ? cat.id : String(id).toLowerCase().trim();
}

export function getAccountTypeById(id) {
    return accountTypes.find(a => a.id === id) || accountTypes[5];
}

// Auto-categorization keywords for AI and PDF parsing
const categoryKeywords = {
    food: ['food', 'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'sushi', 'noodle', 'rice', 'chicken', 'bread', 'milk', 'snack', 'drink', 'tea', 'juice', 'mcdonald', 'kfc', 'starbucks', 'grab food', 'gofood', 'bakery', 'makan', 'nasi', 'ayam', 'mie', 'martabak'],
    transport: ['uber', 'grab', 'gojek', 'taxi', 'bus', 'train', 'fuel', 'gas', 'petrol', 'parking', 'toll', 'mrt', 'lrt', 'bensin', 'parkir', 'maintenance', 'service', 'refuel', 'ev charge', 'charging', 'bengkel', 'servis'],
    daily_needs: ['grocery', 'supermarket', 'indomaret', 'alfamart', 'soap', 'shampoo', 'tissue', 'detergent', 'toothpaste'],
    health: ['pharmacy', 'hospital', 'doctor', 'medicine', 'clinic', 'apotek', 'obat', 'vitamin'],
    shopping: ['mall', 'store', 'amazon', 'shopee', 'tokopedia', 'lazada', 'uniqlo', 'zara', 'h&m', 'clothing', 'shoes', 'iphone', 'ipad', 'smartphone', 'gadget', 'laptop', 'electronics'],
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
