// Simple reactive store to pass selection results back from pickers (category, account) to add-transaction
const listeners = new Set();

export const pickerStore = {
    setSelection(key, value) {
        listeners.forEach(fn => {
            try {
                fn(key, value);
            } catch (err) {
                console.error('[pickerStore error]', err);
            }
        });
    },
    subscribe(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
    },
};
