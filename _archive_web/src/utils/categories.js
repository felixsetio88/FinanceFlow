export const incomeCategories = [
  { id: 'salary', name: 'Salary', icon: '💰', color: '#10b981' },
  { id: 'bonus', name: 'Bonus', icon: '🎁', color: '#f59e0b' },
  { id: 'cashback', name: 'Cashback', icon: '💸', color: '#6366f1' },
  { id: 'investment', name: 'Investment', icon: '📈', color: '#3b82f6' },
  { id: 'freelance', name: 'Freelance', icon: '💼', color: '#8b5cf6' },
  { id: 'other_income', name: 'Other', icon: '📋', color: '#64748b' },
];

export const spendingCategories = [
  { id: 'food', name: 'Food', icon: '🍔', color: '#ef4444' },
  { id: 'transport', name: 'Transport', icon: '🚗', color: '#f97316' },
  { id: 'daily_needs', name: 'Daily Needs', icon: '🛒', color: '#eab308' },
  { id: 'health', name: 'Health', icon: '🏥', color: '#22c55e' },
  { id: 'pets', name: 'Pets', icon: '🐾', color: '#a855f7' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#ec4899' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: '#06b6d4' },
  { id: 'education', name: 'Education', icon: '📚', color: '#3b82f6' },
  { id: 'bills', name: 'Bills', icon: '📄', color: '#64748b' },
  { id: 'rent', name: 'Rent', icon: '🏠', color: '#78716c' },
  { id: 'beauty', name: 'Beauty', icon: '💄', color: '#f472b6' },
  { id: 'gift', name: 'Gift', icon: '🎀', color: '#fb923c' },
  { id: 'other_spending', name: 'Other', icon: '📋', color: '#94a3b8' },
];

export const accountTypes = [
  { id: 'cash', name: 'Cash', icon: '💵' },
  { id: 'bank', name: 'Bank Account', icon: '🏦' },
  { id: 'credit_card', name: 'Credit Card', icon: '💳' },
  { id: 'paypal', name: 'PayPal', icon: '🅿️' },
  { id: 'ewallet', name: 'E-Wallet', icon: '📱' },
  { id: 'other_account', name: 'Other', icon: '📋' },
];

export function getCategoryById(id, type) {
  const cats = type === 'income' ? incomeCategories : spendingCategories;
  return cats.find(c => c.id === id) || cats[cats.length - 1];
}

export function getAccountTypeById(id) {
  return accountTypes.find(a => a.id === id) || accountTypes[accountTypes.length - 1];
}

// Keywords for auto-categorization from receipt scanning
export const categoryKeywords = {
  food: ['chicken', 'rice', 'noodle', 'burger', 'pizza', 'coffee', 'tea', 'milk', 'bread', 'egg', 'meat', 'fish', 'vegetable', 'fruit', 'snack', 'drink', 'juice', 'water', 'sauce', 'sugar', 'salt', 'oil', 'butter', 'cheese', 'restaurant', 'food', 'meal', 'lunch', 'dinner', 'breakfast'],
  daily_needs: ['soap', 'shampoo', 'toothpaste', 'tissue', 'detergent', 'cleaner', 'towel', 'sponge', 'trash bag', 'battery', 'bulb', 'toilet'],
  health: ['medicine', 'vitamin', 'pharmacy', 'hospital', 'doctor', 'clinic', 'prescription', 'bandage', 'mask'],
  beauty: ['lipstick', 'foundation', 'mascara', 'perfume', 'cream', 'lotion', 'skincare', 'makeup', 'nail'],
  pets: ['pet food', 'cat', 'dog', 'fish food', 'litter', 'pet'],
  transport: ['gas', 'fuel', 'parking', 'toll', 'uber', 'grab', 'taxi', 'bus', 'train', 'ticket'],
  shopping: ['shirt', 'pants', 'shoes', 'dress', 'bag', 'watch', 'jewelry', 'electronic', 'phone', 'laptop', 'gadget'],
  entertainment: ['movie', 'game', 'concert', 'sport', 'gym', 'netflix', 'spotify', 'subscription'],
  education: ['book', 'course', 'tuition', 'school', 'university', 'class', 'tutorial'],
  bills: ['electric', 'water bill', 'internet', 'phone bill', 'insurance', 'wifi'],
};

export function autoCategorize(itemName) {
  const lower = itemName.toLowerCase();
  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category;
    }
  }
  return 'other_spending';
}
