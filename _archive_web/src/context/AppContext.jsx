import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import * as db from '../db/database';
import { generateId } from '../utils/helpers';

const AppContext = createContext();

const initialState = {
    transactions: [],
    budgets: [],
    assets: [],
    loading: true,
};

function appReducer(state, action) {
    switch (action.type) {
        case 'LOAD_DATA':
            return { ...state, ...action.payload, loading: false };

        case 'ADD_TRANSACTION':
            return { ...state, transactions: [...state.transactions, action.payload] };
        case 'UPDATE_TRANSACTION':
            return { ...state, transactions: state.transactions.map(t => t.id === action.payload.id ? action.payload : t) };
        case 'DELETE_TRANSACTION':
            return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };

        case 'ADD_BUDGET':
            return { ...state, budgets: [...state.budgets, action.payload] };
        case 'UPDATE_BUDGET':
            return { ...state, budgets: state.budgets.map(b => b.id === action.payload.id ? action.payload : b) };
        case 'DELETE_BUDGET':
            return { ...state, budgets: state.budgets.filter(b => b.id !== action.payload) };

        case 'ADD_ASSET':
            return { ...state, assets: [...state.assets, action.payload] };
        case 'UPDATE_ASSET':
            return { ...state, assets: state.assets.map(a => a.id === action.payload.id ? action.payload : a) };
        case 'DELETE_ASSET':
            return { ...state, assets: state.assets.filter(a => a.id !== action.payload) };

        default:
            return state;
    }
}

export function AppProvider({ children }) {
    const [state, dispatch] = useReducer(appReducer, initialState);

    useEffect(() => {
        async function loadData() {
            const [transactions, budgets, assets] = await Promise.all([
                db.getAllTransactions(),
                db.getAllBudgets(),
                db.getAllAssets(),
            ]);
            dispatch({ type: 'LOAD_DATA', payload: { transactions, budgets, assets } });
        }
        loadData();
    }, []);

    const addTransaction = useCallback(async (data) => {
        const transaction = { ...data, id: generateId() };
        await db.addTransaction(transaction);
        dispatch({ type: 'ADD_TRANSACTION', payload: transaction });
        // Update related asset balance
        if (data.accountId) {
            const asset = state.assets.find(a => a.id === data.accountId);
            if (asset) {
                const newBalance = data.type === 'income'
                    ? asset.balance + data.amount
                    : asset.balance - data.amount;
                const updatedAsset = { ...asset, balance: newBalance };
                await db.updateAsset(updatedAsset);
                dispatch({ type: 'UPDATE_ASSET', payload: updatedAsset });
            }
        }
        return transaction;
    }, [state.assets]);

    const updateTransaction = useCallback(async (data) => {
        await db.updateTransaction(data);
        dispatch({ type: 'UPDATE_TRANSACTION', payload: data });
    }, []);

    const deleteTransaction = useCallback(async (id) => {
        const tx = state.transactions.find(t => t.id === id);
        await db.deleteTransaction(id);
        dispatch({ type: 'DELETE_TRANSACTION', payload: id });
        // Reverse balance change
        if (tx && tx.accountId) {
            const asset = state.assets.find(a => a.id === tx.accountId);
            if (asset) {
                const newBalance = tx.type === 'income'
                    ? asset.balance - tx.amount
                    : asset.balance + tx.amount;
                const updatedAsset = { ...asset, balance: newBalance };
                await db.updateAsset(updatedAsset);
                dispatch({ type: 'UPDATE_ASSET', payload: updatedAsset });
            }
        }
    }, [state.transactions, state.assets]);

    const addBudget = useCallback(async (data) => {
        const budget = { ...data, id: generateId() };
        await db.addBudget(budget);
        dispatch({ type: 'ADD_BUDGET', payload: budget });
        return budget;
    }, []);

    const updateBudget = useCallback(async (data) => {
        await db.updateBudget(data);
        dispatch({ type: 'UPDATE_BUDGET', payload: data });
    }, []);

    const deleteBudget = useCallback(async (id) => {
        await db.deleteBudget(id);
        dispatch({ type: 'DELETE_BUDGET', payload: id });
    }, []);

    const addAsset = useCallback(async (data) => {
        const asset = { ...data, id: generateId() };
        await db.addAsset(asset);
        dispatch({ type: 'ADD_ASSET', payload: asset });
        return asset;
    }, []);

    const updateAsset = useCallback(async (data) => {
        await db.updateAsset(data);
        dispatch({ type: 'UPDATE_ASSET', payload: data });
    }, []);

    const deleteAsset = useCallback(async (id) => {
        await db.deleteAsset(id);
        dispatch({ type: 'DELETE_ASSET', payload: id });
    }, []);

    const getTotalIncome = useCallback((transactions) => {
        return transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    }, []);

    const getTotalSpending = useCallback((transactions) => {
        return transactions.filter(t => t.type === 'spending').reduce((sum, t) => sum + t.amount, 0);
    }, []);

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
        getTotalIncome,
        getTotalSpending,
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within AppProvider');
    }
    return context;
}
