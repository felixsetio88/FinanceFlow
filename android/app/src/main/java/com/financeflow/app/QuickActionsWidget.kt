package com.financeflow.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

class QuickActionsWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_quick_actions)

            // Log Expense button — deep links to add-transaction
            val expenseIntent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("financeflow://add-transaction")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val expensePending = PendingIntent.getActivity(
                context, 1001, expenseIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_log_expense, expensePending)

            // Scan Receipt button
            val receiptIntent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("financeflow://receipt-scanner")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val receiptPending = PendingIntent.getActivity(
                context, 1002, receiptIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_scan_receipt, receiptPending)

            // Add Savings button
            val savingsIntent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("financeflow://savings?action=add")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            val savingsPending = PendingIntent.getActivity(
                context, 1003, savingsIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.btn_add_savings, savingsPending)

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
