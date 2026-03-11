import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import * as db from '../services/database';

const AppContext = createContext();

const initialState = {
    transactions: [],
    budgets: [],
    assets: [],
    currency: 'USD',
    aiApiKey: '',
    aiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    loading: true,
};

function reducer(state, action) {
    switch (action.type) {
        case 'LOAD_DATA':
            return {
                ...state,
                transactions: action.payload.transactions,
                budgets: action.payload.budgets,
                assets: action.payload.assets,
                currency: action.payload.settings?.currency || 'USD',
                aiApiKey: action.payload.settings?.aiApiKey || '',
                aiEndpoint: action.payload.settings?.aiEndpoint || state.aiEndpoint,
                loading: false,
            };
        case 'ADD_TRANSACTION':
            return { ...state, transactions: [action.payload, ...state.transactions] };
        case 'UPDATE_TRANSACTION':
            return {
                ...state,
                transactions: state.transactions.map(t =>
                    t.id === action.payload.id ? action.payload : t
                ),
            };
        case 'DELETE_TRANSACTION':
            return {
                ...state,
                transactions: state.transactions.filter(t => t.id !== action.payload),
            };
        case 'ADD_BUDGET':
            return { ...state, budgets: [action.payload, ...state.budgets] };
        case 'UPDATE_BUDGET':
            return {
                ...state,
                budgets: state.budgets.map(b =>
                    b.id === action.payload.id ? action.payload : b
                ),
            };
        case 'DELETE_BUDGET':
            return { ...state, budgets: state.budgets.filter(b => b.id !== action.payload) };
        case 'ADD_ASSET':
            return { ...state, assets: [action.payload, ...state.assets] };
        case 'UPDATE_ASSET':
            return {
                ...state,
                assets: state.assets.map(a =>
                    a.id === action.payload.id ? action.payload : a
                ),
            };
        case 'DELETE_ASSET':
            return { ...state, assets: state.assets.filter(a => a.id !== action.payload) };
        case 'SET_CURRENCY':
            return { ...state, currency: action.payload };
        case 'SET_AI_CONFIG':
            return { ...state, aiApiKey: action.payload.apiKey, aiEndpoint: action.payload.endpoint };
        case 'BULK_ADD_TRANSACTIONS':
            return { ...state, transactions: [...action.payload, ...state.transactions] };
        default:
            return state;
    }
}

export function AppProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, initialState);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const data = await db.getAllData();
            dispatch({ type: 'LOAD_DATA', payload: data });
        } catch (e) {
            console.error('Failed to load data:', e);
            dispatch({ type: 'LOAD_DATA', payload: { transactions: [], budgets: [], assets: [], settings: {} } });
        }
    };

    const addTransaction = useCallback(async (tx) => {
        const id = await db.addTransaction({ ...tx, currency: state.currency });
        const fullTx = { ...tx, id, currency: state.currency, items: tx.items || [], photos: tx.photos || [] };
        dispatch({ type: 'ADD_TRANSACTION', payload: fullTx });
        return id;
    }, [state.currency]);

    const updateTransaction = useCallback(async (tx) => {
        await db.updateTransaction(tx);
        dispatch({ type: 'UPDATE_TRANSACTION', payload: tx });
    }, []);

    const deleteTransaction = useCallback(async (id) => {
        await db.deleteTransaction(id);
        dispatch({ type: 'DELETE_TRANSACTION', payload: id });
    }, []);

    const addBudget = useCallback(async (b) => {
        const id = await db.addBudget({ ...b, currency: state.currency });
        dispatch({ type: 'ADD_BUDGET', payload: { ...b, id, currency: state.currency } });
    }, [state.currency]);

    const updateBudget = useCallback(async (b) => {
        await db.updateBudget(b);
        dispatch({ type: 'UPDATE_BUDGET', payload: b });
    }, []);

    const deleteBudget = useCallback(async (id) => {
        await db.deleteBudget(id);
        dispatch({ type: 'DELETE_BUDGET', payload: id });
    }, []);

    const addAsset = useCallback(async (a) => {
        const id = await db.addAsset({ ...a, currency: state.currency });
        dispatch({ type: 'ADD_ASSET', payload: { ...a, id, currency: state.currency } });
    }, [state.currency]);

    const updateAsset = useCallback(async (a) => {
        await db.updateAsset(a);
        dispatch({ type: 'UPDATE_ASSET', payload: a });
    }, []);

    const deleteAsset = useCallback(async (id) => {
        await db.deleteAsset(id);
        dispatch({ type: 'DELETE_ASSET', payload: id });
    }, []);

    const setCurrency = useCallback(async (code) => {
        await db.setSetting('currency', code);
        dispatch({ type: 'SET_CURRENCY', payload: code });
    }, []);

    const setAiConfig = useCallback(async (apiKey, endpoint) => {
        await db.setSetting('ai_api_key', apiKey);
        if (endpoint) await db.setSetting('ai_endpoint', endpoint);
        dispatch({ type: 'SET_AI_CONFIG', payload: { apiKey, endpoint: endpoint || state.aiEndpoint } });
    }, [state.aiEndpoint]);

    const bulkAddTransactions = useCallback(async (transactions) => {
        await db.bulkAddTransactions(transactions.map(t => ({ ...t, currency: state.currency })));
        dispatch({ type: 'BULK_ADD_TRANSACTIONS', payload: transactions });
    }, [state.currency]);

    // Computed values
    const getIncome = useCallback((period, ref) => {
        const { filterTransactionsByPeriod } = require('../utils/helpers');
        const filtered = filterTransactionsByPeriod(state.transactions, period, ref);
        return filtered.filter(t => t.type === 'income').reduce((s, t) => s + Math.abs(t.amount), 0);
    }, [state.transactions]);

    const getSpending = useCallback((period, ref) => {
        const { filterTransactionsByPeriod } = require('../utils/helpers');
        const filtered = filterTransactionsByPeriod(state.transactions, period, ref);
        return filtered.filter(t => t.type === 'spending').reduce((s, t) => s + Math.abs(t.amount), 0);
    }, [state.transactions]);

    const value = {
        ...state,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        addBudget,
        updateBudget,
        deleteBudget,
        addAsset,
        updateAsset,
        deleteAsset,
        setCurrency,
        setAiConfig,
        bulkAddTransactions,
        getIncome,
        getSpending,
        loadData,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
}
