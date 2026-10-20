package com.financeflow.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri

class DailyAllowanceWidget : AppWidgetProvider() {

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
        const val PREFS_NAME = "financeflow_widget"
        const val KEY_DATA = "widget_data"

        fun updateAppWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_daily_allowance)

            // Tap anywhere to open the app
            val openIntent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("financeflow://")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            val openPending = PendingIntent.getActivity(
                context, 2001, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.tv_remaining, openPending)

            // Read persisted widget data
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val json = prefs.getString(KEY_DATA, null)

            if (json != null) {
                try {
                    val data = JSONObject(json)
                    val allowance = data.optJSONObject("dailyAllowance")
                    val currency = data.optString("currency", "USD")

                    if (allowance != null) {
                        val remaining = allowance.optDouble("remaining", 0.0)
                        val dailyBudget = allowance.optDouble("dailyBudget", 0.0)
                        val todaySpent = allowance.optDouble("todaySpent", 0.0)
                        val percentage = allowance.optInt("percentage", 0)

                        val numFmt = NumberFormat.getNumberInstance(Locale.getDefault()).apply {
                            maximumFractionDigits = if (currency in listOf("IDR", "JPY", "KRW", "VND")) 0 else 2
                            minimumFractionDigits = 0
                        }
                        val currencySymbol = when (currency) {
                            "USD" -> "$"
                            "IDR" -> "Rp "
                            "EUR" -> "€"
                            "GBP" -> "£"
                            "JPY" -> "¥"
                            "MYR" -> "RM "
                            "SGD" -> "S$"
                            "AUD" -> "A$"
                            "CAD" -> "C$"
                            else -> "$currency "
                        }

                        val remainingStr = if (remaining >= 0)
                            "$currencySymbol${numFmt.format(remaining)}"
                        else
                            "-$currencySymbol${numFmt.format(-remaining)}"

                        views.setTextViewText(R.id.tv_remaining, remainingStr)
                        views.setTextViewText(
                            R.id.tv_status,
                            if (remaining >= 0) "remaining today" else "over budget"
                        )
                        views.setProgressBar(R.id.progress_bar, 100, percentage.coerceIn(0, 100), false)
                        views.setTextViewText(
                            R.id.tv_spent,
                            "Spent: $currencySymbol${numFmt.format(todaySpent)}"
                        )
                        views.setTextViewText(
                            R.id.tv_budget,
                            "Budget: $currencySymbol${numFmt.format(dailyBudget)}"
                        )

                        // Color: green if under 70%, orange if 70-100%, red if over
                        val color = when {
                            percentage < 70 -> android.graphics.Color.parseColor("#22C55E")
                            percentage < 100 -> android.graphics.Color.parseColor("#FF6600")
                            else -> android.graphics.Color.parseColor("#EF4444")
                        }
                        views.setTextColor(R.id.tv_remaining, color)
                    }
                } catch (e: Exception) {
                    views.setTextViewText(R.id.tv_remaining, "No data")
                }
            } else {
                views.setTextViewText(R.id.tv_remaining, "Open app")
                views.setTextViewText(R.id.tv_status, "to set up budgets")
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
