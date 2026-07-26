import React, { createContext, useContext, useReducer, useEffect, useCallback, useState } from 'react';
import { Alert, AppState } from 'react-native';
import * as db from '../services/database';
import { getOrFetchRates, fetchExchangeRates, convertCurrency } from '../services/exchangeRates';
import { obdManager } from '../services/obdManager';

const AppContext = createContext();

function reportMutationError(action, error) {
    console.error(`${action} failed:`, error);
    Alert.alert('Save Failed', `${action} could not be saved. Please try again.`);
}

function normalizeSavingHistory(goal) {
    if (Array.isArray(goal?.savingHistory)) return goal.savingHistory;
    if (Array.isArray(goal?.savingsHistory)) return goal.savingsHistory;
    return [];
}

const initialState = {
    transactions: [],
    budgets: [],
    assets: [],
    savingsGoals: [],
    chatSessions: [],
    vehicles: [],
    currency: 'USD',
    exchangeRates: null,
    aiApiKey: '',
    aiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    onboardingCompleted: false,
    loading: true,
};

function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function reducer(state, action) {
    switch (action.type) {
        case 'LOAD_DATA':
            return {
                ...state,
                transactions: action.payload.transactions,
                budgets: action.payload.budgets,
                assets: action.payload.assets,
                savingsGoals: action.payload.savingsGoals || [],
                chatSessions: action.payload.chatSessions || [],
                vehicles: action.payload.vehicles || [],
                currency: action.payload.settings?.currency || 'USD',
                aiApiKey: action.payload.settings?.aiApiKey || '',
                aiEndpoint: action.payload.settings?.aiEndpoint || state.aiEndpoint,
                onboardingCompleted: action.payload.settings?.onboardingCompleted || false,
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
        case 'SET_RATES':
            return { ...state, exchangeRates: action.payload };
        case 'SET_AI_CONFIG':
            return { ...state, aiApiKey: action.payload.apiKey, aiEndpoint: action.payload.endpoint };
        case 'BULK_ADD_TRANSACTIONS':
            return { ...state, transactions: [...action.payload, ...state.transactions] };
        case 'ADD_SAVINGS_GOAL':
            return { ...state, savingsGoals: [action.payload, ...state.savingsGoals] };
        case 'UPDATE_SAVINGS_GOAL':
            return { ...state, savingsGoals: state.savingsGoals.map(g => g.id === action.payload.id ? action.payload : g) };
        case 'DELETE_SAVINGS_GOAL':
            return { ...state, savingsGoals: state.savingsGoals.filter(g => g.id !== action.payload) };
        case 'ADD_CHAT_SESSION':
            return { ...state, chatSessions: [action.payload, ...state.chatSessions] };
        case 'UPDATE_CHAT_SESSION':
            return {
                ...state,
                chatSessions: state.chatSessions.map(s => s.id === action.payload.id ? { ...s, messages: action.payload.messages, updatedAt: action.payload.updatedAt } : s)
            };
        case 'DELETE_CHAT_SESSION':
            return { ...state, chatSessions: state.chatSessions.filter(s => s.id !== action.payload) };
        case 'SET_ONBOARDING_COMPLETED':
            return { ...state, onboardingCompleted: true };
        case 'ADD_VEHICLE':
            return { ...state, vehicles: [action.payload, ...state.vehicles] };
        case 'UPDATE_VEHICLE':
            return {
                ...state,
                vehicles: state.vehicles.map(v => v.id === action.payload.id ? action.payload : v)
            };
        case 'DELETE_VEHICLE':
            return { ...state, vehicles: state.vehicles.filter(v => v.id !== action.payload) };
        case 'SET_DEFAULT_VEHICLE':
            return {
                ...state,
                vehicles: state.vehicles.map(v => ({ ...v, isDefault: v.id === action.payload ? 1 : 0 }))
            };
        default:
            return state;
    }
}

export function AppProvider({ children }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const [currentDateKey, setCurrentDateKey] = useState(getLocalDateKey());

    useEffect(() => {
        loadData();
        obdManager.init();
    }, []);

    useEffect(() => {
        let midnightTimeoutId = null;

        const scheduleMidnightTick = () => {
            if (midnightTimeoutId) {
                clearTimeout(midnightTimeoutId);
            }

            const now = new Date();
            const nextMidnight = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate() + 1,
                0,
                0,
                1
            );

            midnightTimeoutId = setTimeout(() => {
                setCurrentDateKey(getLocalDateKey(new Date()));
                scheduleMidnightTick();
            }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
        };

        scheduleMidnightTick();

        const appStateSub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                setCurrentDateKey(getLocalDateKey(new Date()));
                scheduleMidnightTick();
            }
        });

        return () => {
            if (midnightTimeoutId) {
                clearTimeout(midnightTimeoutId);
            }
            appStateSub?.remove?.();
        };
    }, []);

    const loadData = async () => {
        try {
            const data = await db.getAllData();
            dispatch({ type: 'LOAD_DATA', payload: data });
            // Fetch exchange rates after loading settings
            const curr = data.settings?.currency || 'USD';
            getOrFetchRates(curr).then(rates => {
                if (rates) dispatch({ type: 'SET_RATES', payload: rates });
            });
        } catch (e) {
            console.error('Failed to load data:', e);
            dispatch({ type: 'LOAD_DATA', payload: { transactions: [], budgets: [], assets: [], settings: {} } });
        }
    };

    const addTransaction = useCallback(async (tx) => {
        try {
            const txCurrency = tx.currency || state.currency;
            const id = await db.addTransaction({ ...tx, currency: txCurrency });
            const fullTx = { ...tx, id, currency: txCurrency, items: tx.items || [], photos: tx.photos || [] };
            dispatch({ type: 'ADD_TRANSACTION', payload: fullTx });
            return id;
        } catch (error) {
            reportMutationError('Add transaction', error);
            throw error;
        }
    }, [state.currency]);

    const updateTransaction = useCallback(async (tx) => {
        try {
            await db.updateTransaction(tx);
            dispatch({ type: 'UPDATE_TRANSACTION', payload: tx });
        } catch (error) {
            reportMutationError('Update transaction', error);
            throw error;
        }
    }, []);

    const deleteTransaction = useCallback(async (id) => {
        try {
            await db.deleteTransaction(id);
            dispatch({ type: 'DELETE_TRANSACTION', payload: id });
        } catch (error) {
            reportMutationError('Delete transaction', error);
            throw error;
        }
    }, []);

    const addBudget = useCallback(async (b) => {
        try {
            const id = await db.addBudget({ ...b, category: b.category || 'all', currency: state.currency });
            dispatch({ type: 'ADD_BUDGET', payload: { ...b, id, category: b.category || 'all', currency: state.currency } });
            return id;
        } catch (error) {
            reportMutationError('Add budget', error);
            throw error;
        }
    }, [state.currency]);

    const updateBudget = useCallback(async (b) => {
        try {
            const normalized = { ...b, category: b.category || 'all' };
            await db.updateBudget(normalized);
            dispatch({ type: 'UPDATE_BUDGET', payload: normalized });
        } catch (error) {
            reportMutationError('Update budget', error);
            throw error;
        }
    }, []);

    const deleteBudget = useCallback(async (id) => {
        try {
            await db.deleteBudget(id);
            dispatch({ type: 'DELETE_BUDGET', payload: id });
        } catch (error) {
            reportMutationError('Delete budget', error);
            throw error;
        }
    }, []);

    const addAsset = useCallback(async (a) => {
        try {
            const id = await db.addAsset({ ...a, currency: a.currency || state.currency });
            dispatch({ type: 'ADD_ASSET', payload: { ...a, id, currency: a.currency || state.currency } });
            return id;
        } catch (error) {
            reportMutationError('Add asset', error);
            throw error;
        }
    }, [state.currency]);

    const updateAsset = useCallback(async (a) => {
        try {
            await db.updateAsset(a);
            dispatch({ type: 'UPDATE_ASSET', payload: a });
        } catch (error) {
            reportMutationError('Update asset', error);
            throw error;
        }
    }, []);

    const deleteAsset = useCallback(async (id) => {
        try {
            await db.deleteAsset(id);
            dispatch({ type: 'DELETE_ASSET', payload: id });
        } catch (error) {
            reportMutationError('Delete asset', error);
            throw error;
        }
    }, []);

    const setCurrency = useCallback(async (code) => {
        try {
            await db.setSetting('currency', code);
            dispatch({ type: 'SET_CURRENCY', payload: code });
            // Refresh rates for the new base currency
            getOrFetchRates(code).then(rates => {
                if (rates) dispatch({ type: 'SET_RATES', payload: rates });
            });
        } catch (error) {
            reportMutationError('Update currency', error);
            throw error;
        }
    }, []);

    const refreshExchangeRates = useCallback(async () => {
        try {
            const fresh = await fetchExchangeRates(state.currency);
            if (fresh) {
                dispatch({ type: 'SET_RATES', payload: fresh });
                return true;
            }
            return false;
        } catch (e) {
            console.error('Failed to refresh rates:', e);
            return false;
        }
    }, [state.currency]);

    const setAiConfig = useCallback(async (apiKey, endpoint) => {
        try {
            await db.setSetting('ai_api_key', apiKey);
            if (endpoint) await db.setSetting('ai_endpoint', endpoint);
            dispatch({ type: 'SET_AI_CONFIG', payload: { apiKey, endpoint: endpoint || state.aiEndpoint } });
        } catch (error) {
            reportMutationError('Update AI settings', error);
            throw error;
        }
    }, [state.aiEndpoint]);

    const bulkAddTransactions = useCallback(async (transactions) => {
        try {
            const normalized = transactions.map(t => ({ ...t, currency: t.currency || state.currency }));
            await db.bulkAddTransactions(normalized);
            dispatch({ type: 'BULK_ADD_TRANSACTIONS', payload: normalized });
        } catch (error) {
            reportMutationError('Import transactions', error);
            throw error;
        }
    }, [state.currency]);

    const addSavingGoal = useCallback(async (goal) => {
        try {
            const savingHistory = normalizeSavingHistory(goal);
            const id = await db.addSavingsGoal({ ...goal, savingHistory, currency: state.currency });
            dispatch({
                type: 'ADD_SAVINGS_GOAL',
                payload: {
                    ...goal,
                    id,
                    currency: state.currency,
                    currentAmount: goal.currentAmount || 0,
                    savingHistory,
                },
            });
            return id;
        } catch (error) {
            reportMutationError('Add savings goal', error);
            throw error;
        }
    }, [state.currency]);

    const updateSavingGoal = useCallback(async (goal) => {
        try {
            const normalized = { ...goal, savingHistory: normalizeSavingHistory(goal) };
            await db.updateSavingsGoal(normalized);
            dispatch({ type: 'UPDATE_SAVINGS_GOAL', payload: normalized });
        } catch (error) {
            reportMutationError('Update savings goal', error);
            throw error;
        }
    }, []);

    const deleteSavingGoal = useCallback(async (id) => {
        try {
            await db.deleteSavingsGoal(id);
            dispatch({ type: 'DELETE_SAVINGS_GOAL', payload: id });
        } catch (error) {
            reportMutationError('Delete savings goal', error);
            throw error;
        }
    }, []);

    const addChatSession = useCallback(async (session) => {
        try {
            const id = await db.addChatSession(session);
            const fullSession = { ...session, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            dispatch({ type: 'ADD_CHAT_SESSION', payload: fullSession });
            return id;
        } catch (error) {
            reportMutationError('Add chat session', error);
            throw error;
        }
    }, []);

    const updateChatSession = useCallback(async (id, messages) => {
        try {
            await db.updateChatSession(id, messages);
            dispatch({ type: 'UPDATE_CHAT_SESSION', payload: { id, messages, updatedAt: new Date().toISOString() } });
        } catch (error) {
            reportMutationError('Update chat session', error);
            throw error;
        }
    }, []);

    const deleteChatSession = useCallback(async (id) => {
        try {
            await db.deleteChatSession(id);
            dispatch({ type: 'DELETE_CHAT_SESSION', payload: id });
        } catch (error) {
            reportMutationError('Delete chat session', error);
            throw error;
        }
    }, []);

    const setOnboardingCompleted = useCallback(async () => {
        try {
            await db.setSetting('onboarding_completed', 'true');
            dispatch({ type: 'SET_ONBOARDING_COMPLETED' });
        } catch (error) {
            reportMutationError('Update onboarding status', error);
            throw error;
        }
    }, []);

    const addVehicle = useCallback(async (vehicle) => {
        try {
            const id = await db.addVehicle({ ...vehicle, currency: state.currency });
            dispatch({ type: 'ADD_VEHICLE', payload: { ...vehicle, id, currency: state.currency, createdAt: new Date().toISOString() } });
            return id;
        } catch (error) {
            reportMutationError('Add vehicle', error);
            throw error;
        }
    }, [state.currency]);

    const updateVehicle = useCallback(async (vehicle) => {
        try {
            await db.updateVehicle(vehicle);
            dispatch({ type: 'UPDATE_VEHICLE', payload: vehicle });
        } catch (error) {
            reportMutationError('Update vehicle', error);
            throw error;
        }
    }, []);

    const deleteVehicle = useCallback(async (id) => {
        try {
            await db.deleteVehicle(id);
            dispatch({ type: 'DELETE_VEHICLE', payload: id });
        } catch (error) {
            reportMutationError('Delete vehicle', error);
            throw error;
        }
    }, []);

    const setDefaultVehicle = useCallback(async (id) => {
        try {
            await db.setDefaultVehicle(id);
            dispatch({ type: 'SET_DEFAULT_VEHICLE', payload: id });
        } catch (err) {
            console.error('Failed to set default vehicle:', err);
            throw err;
        }
    }, []);

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
        currentDateKey,
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
        refreshExchangeRates,
        convertCurrency,
        setAiConfig,
        bulkAddTransactions,
        getIncome,
        getSpending,
        loadData,
        addSavingGoal,
        updateSavingGoal,
        deleteSavingGoal,
        addChatSession,
        updateChatSession,
        deleteChatSession,
        setOnboardingCompleted,
        addVehicle,
        updateVehicle,
        deleteVehicle,
        setDefaultVehicle,
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
}
