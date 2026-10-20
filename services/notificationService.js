/**
 * notificationService.js
 *
 * Handles all local push notification scheduling for savings reminders.
 * Uses expo-notifications to schedule repeating local notifications.
 */
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const REMINDER_TIME_KEY = 'savings_reminder_time'; // stored as "HH:MM" (24h)
const DEFAULT_REMINDER_TIME = '09:00';

// Configure how notifications are shown when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

/**
 * Returns the stored reminder time as { hour, minute }, defaulting to 9:00 AM.
 */
export async function getReminderTime() {
    try {
        const stored = await AsyncStorage.getItem(REMINDER_TIME_KEY);
        const raw = stored || DEFAULT_REMINDER_TIME;
        const [h, m] = raw.split(':').map(Number);
        return { hour: isNaN(h) ? 9 : h, minute: isNaN(m) ? 0 : m, raw: stored || DEFAULT_REMINDER_TIME };
    } catch {
        return { hour: 9, minute: 0, raw: DEFAULT_REMINDER_TIME };
    }
}

/**
 * Persists the reminder time.
 * @param {string} timeStr - "HH:MM" format, e.g. "09:00"
 */
export async function saveReminderTime(timeStr) {
    await AsyncStorage.setItem(REMINDER_TIME_KEY, timeStr);
}

/**
 * Requests push notification permission from the OS.
 * Returns true if granted, false otherwise.
 */
export async function requestPermission() {
    if (Platform.OS === 'web') return false;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync({
        ios: {
            allowAlert: true,
            allowBadge: false,
            allowSound: true,
        },
    });
    return status === 'granted';
}

/**
 * Builds the notification identifier for a goal.
 * Keeping a stable ID per goal lets us cancel it precisely.
 */
function notifId(goalId) {
    return `saving_reminder_${goalId}`;
}

/**
 * Schedules a repeating local notification for a savings goal.
 *
 * @param {object} goal - The savings goal object (must have id, title, commitment)
 * @param {number} hour - Hour to fire (0-23)
 * @param {number} minute - Minute to fire (0-59)
 */
export async function scheduleGoalReminder(goal, hour, minute) {
    if (!goal || !goal.notifyEnabled || !goal.commitment) return;

    // Cancel any existing notification for this goal before scheduling a new one
    await cancelGoalReminder(goal.id);

    const identifier = notifId(goal.id);

    let trigger;
    if (goal.commitment === 'daily') {
        trigger = {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour,
            minute,
        };
    } else if (goal.commitment === 'weekly') {
        trigger = {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: 2, // Monday (1=Sun, 2=Mon ... 7=Sat)
            hour,
            minute,
        };
    } else {
        // monthly — fire on the 1st of every month
        trigger = {
            type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
            day: 1,
            hour,
            minute,
        };
    }

    const frequencyLabel = {
        daily: 'daily',
        weekly: 'every week',
        monthly: 'this month',
    }[goal.commitment] || 'regularly';

    try {
        await Notifications.scheduleNotificationAsync({
            identifier,
            content: {
                title: `💰 Savings Reminder — ${goal.title}`,
                body: `Don't forget to add your ${frequencyLabel} savings deposit to stay on track!`,
                data: { goalId: goal.id, type: 'savings_reminder' },
            },
            trigger,
        });
    } catch (err) {
        console.warn('[notificationService] Failed to schedule reminder:', err);
    }
}

/**
 * Cancels a previously scheduled notification for a savings goal.
 * @param {string} goalId
 */
export async function cancelGoalReminder(goalId) {
    try {
        await Notifications.cancelScheduledNotificationAsync(notifId(goalId));
    } catch {
        // Silently ignore — notification may not exist yet
    }
}

/**
 * Re-schedules ALL active goal reminders (e.g., when user changes global reminder time).
 *
 * @param {Array} goals - All savings goals from state
 * @param {number} hour
 * @param {number} minute
 */
export async function rescheduleAllReminders(goals, hour, minute) {
    const activeGoals = (goals || []).filter(g => g.notifyEnabled && g.commitment && !g.isCompleted);
    for (const goal of activeGoals) {
        await scheduleGoalReminder(goal, hour, minute);
    }
}

/**
 * Fires an immediate local notification for a recurring transaction that is due
 * and requires user confirmation before posting.
 *
 * @param {object} rt - The recurring transaction template object.
 *   rt.id, rt.templateData.description, rt.templateData.amount, rt.frequency
 */
export async function scheduleRecurringConfirmNotification(rt) {
    if (Platform.OS === 'web') return;

    const { frequencyLabel } = require('./recurringEngine');
    const template = rt.templateData || {};
    const desc = template.description || 'Recurring Transaction';
    const amt = template.amount ? `$${Number(template.amount).toFixed(2)}` : '';
    const freqLabel = frequencyLabel(rt.frequency);

    try {
        await Notifications.scheduleNotificationAsync({
            identifier: `recurring_confirm_${rt.id}_${Date.now()}`,
            content: {
                title: `🔁 ${freqLabel} payment due`,
                body: `${desc}${amt ? ' · ' + amt : ''} — tap to review and post`,
                data: {
                    type: 'recurring_confirm',
                    recurringId: rt.id,
                    prefill: JSON.stringify(template),
                },
            },
            trigger: null, // fire immediately
        });
    } catch (err) {
        console.warn('[notificationService] Failed to schedule recurring confirm notification:', err);
    }
}
