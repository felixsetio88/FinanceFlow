import { getNextDueDate } from '../utils/helpers';
import { convertCurrency } from './exchangeRates';

function todayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

export function frequencyLabel(frequency) {
    return {
        daily: 'Daily',
        weekly: 'Weekly',
        biweekly: 'Bi-weekly',
        monthly: 'Monthly',
        yearly: 'Yearly',
    }[frequency] || frequency;
}

export async function processDueRecurringTransactions(
    addTransactionFn,
    recurringList,
    updateRecurring,
    onConfirmDue = null,
    assets = [],
    updateAssetFn = null,
    exchangeRates = null,
    defaultCurrency = 'USD'
) {
    if (!recurringList || recurringList.length === 0) return [];

    const today = new Date(todayISO());
    const processed = [];

    for (const rt of recurringList) {
        if (!rt.isActive) continue;

        const dueDate = new Date(rt.nextDueDate);
        if (Number.isNaN(dueDate.getTime()) || dueDate > today) continue;

        const nextDue = getNextDueDate(rt.frequency, rt.nextDueDate);

        if (rt.postMode === 'auto') {
            try {
                const template = rt.templateData || {};
                const txToPost = {
                    ...template,
                    date: new Date(rt.nextDueDate).toISOString(),
                };
                delete txToPost.id;

                await addTransactionFn(txToPost);

                // Atomically update linked asset balance(s)
                if (updateAssetFn && Array.isArray(assets)) {
                    const amt = Math.abs(Number(txToPost.amount) || 0);
                    if (txToPost.type === 'move' && txToPost.fromAssetId && txToPost.toAssetId) {
                        const fromAsset = assets.find(a => a.id === txToPost.fromAssetId);
                        const toAsset = assets.find(a => a.id === txToPost.toAssetId);
                        if (fromAsset) {
                            await updateAssetFn({ ...fromAsset, balance: (Number(fromAsset.balance) || 0) - amt });
                        }
                        if (toAsset) {
                            const fromCur = fromAsset?.currency || txToPost.currency || defaultCurrency;
                            const toCur = toAsset.currency || defaultCurrency;
                            const creditAmt = fromCur !== toCur
                                ? convertCurrency(amt, fromCur, toCur, exchangeRates)
                                : amt;
                            await updateAssetFn({ ...toAsset, balance: (Number(toAsset.balance) || 0) + creditAmt });
                        }
                    } else if (txToPost.assetId) {
                        const linkedAsset = assets.find(a => a.id === txToPost.assetId);
                        if (linkedAsset) {
                            const txCur = txToPost.currency || linkedAsset.currency || defaultCurrency;
                            const assetCur = linkedAsset.currency || defaultCurrency;
                            const adjAmt = txCur !== assetCur
                                ? convertCurrency(amt, txCur, assetCur, exchangeRates)
                                : amt;
                            const delta = txToPost.type === 'income' ? adjAmt : -adjAmt;
                            await updateAssetFn({ ...linkedAsset, balance: (Number(linkedAsset.balance) || 0) + delta });
                        }
                    }
                }

                await updateRecurring({
                    ...rt,
                    nextDueDate: nextDue,
                    lastPostedDate: rt.nextDueDate,
                });
                processed.push(rt.id);
            } catch (err) {
                console.warn('[recurringEngine] Failed to auto-post recurring tx:', rt.id, err);
            }
        } else if (rt.postMode === 'confirm') {
            try {
                if (onConfirmDue) {
                    await onConfirmDue(rt);
                }
                // Advance nextDueDate so the user isn't spammed on every state update / app launch
                await updateRecurring({
                    ...rt,
                    nextDueDate: nextDue,
                    lastPostedDate: rt.nextDueDate,
                });
                processed.push(rt.id);
            } catch (err) {
                console.warn('[recurringEngine] Failed to notify confirm-mode recurring tx:', rt.id, err);
            }
        }
    }

    return processed;
}
