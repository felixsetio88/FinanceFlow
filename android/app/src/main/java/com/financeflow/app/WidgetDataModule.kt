package com.financeflow.app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class WidgetDataModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "WidgetDataModule"

    @ReactMethod
    fun updateWidgetData(jsonData: String, promise: Promise) {
        try {
            val context = reactApplicationContext

            // Persist to SharedPreferences
            val prefs = context.getSharedPreferences(
                DailyAllowanceWidget.PREFS_NAME,
                Context.MODE_PRIVATE
            )
            prefs.edit().putString(DailyAllowanceWidget.KEY_DATA, jsonData).apply()

            // Notify all Daily Allowance widgets to refresh
            val manager = AppWidgetManager.getInstance(context)
            val dailyIds = manager.getAppWidgetIds(
                ComponentName(context, DailyAllowanceWidget::class.java)
            )
            if (dailyIds.isNotEmpty()) {
                val intent = Intent(context, DailyAllowanceWidget::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, dailyIds)
                }
                context.sendBroadcast(intent)
            }

            // Notify Quick Actions widgets to refresh
            val quickIds = manager.getAppWidgetIds(
                ComponentName(context, QuickActionsWidget::class.java)
            )
            if (quickIds.isNotEmpty()) {
                val intent = Intent(context, QuickActionsWidget::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, quickIds)
                }
                context.sendBroadcast(intent)
            }

            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("WIDGET_UPDATE_ERROR", e.message, e)
        }
    }
}
