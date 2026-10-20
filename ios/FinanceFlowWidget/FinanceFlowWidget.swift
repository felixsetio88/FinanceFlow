//
//  FinanceFlowWidget.swift
//  FinanceFlowWidget
//
//  WidgetKit extension providing two widgets:
//  1. Quick Actions Widget — log expense, scan receipt, add savings
//  2. Daily Allowance Widget — glanceable budget remaining
//

import WidgetKit
import SwiftUI

// ─── Shared Data Model ────────────────────────────────────────────────────────

let APP_GROUP = "group.com.financeflow.app"
let WIDGET_DATA_KEY = "financeflow_widget_data"

struct DailyAllowanceData {
    var dailyBudget: Double = 0
    var todaySpent: Double = 0
    var remaining: Double = 0
    var percentage: Int = 0
    var currency: String = "USD"
}

struct SavingsGoalData {
    var name: String = ""
    var savedAmount: Double = 0
    var targetAmount: Double = 0
    var percentage: Int = 0
}

struct WidgetData {
    var allowance: DailyAllowanceData = DailyAllowanceData()
    var nearestGoal: SavingsGoalData? = nil
    var hasGoals: Bool = false
    var updatedAt: Date = Date()
}

func loadWidgetData() -> WidgetData {
    guard
        let defaults = UserDefaults(suiteName: APP_GROUP),
        let json = defaults.string(forKey: WIDGET_DATA_KEY),
        let data = json.data(using: .utf8),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
        return WidgetData()
    }

    var wd = WidgetData()
    wd.hasGoals = obj["hasGoals"] as? Bool ?? false
    wd.updatedAt = Date()

    if let allowanceObj = obj["dailyAllowance"] as? [String: Any] {
        wd.allowance.dailyBudget = allowanceObj["dailyBudget"] as? Double ?? 0
        wd.allowance.todaySpent = allowanceObj["todaySpent"] as? Double ?? 0
        wd.allowance.remaining = allowanceObj["remaining"] as? Double ?? 0
        wd.allowance.percentage = allowanceObj["percentage"] as? Int ?? 0
        wd.allowance.currency = obj["currency"] as? String ?? "USD"
    }

    if let savingsObj = obj["savings"] as? [String: Any],
       let goalObj = savingsObj["nearestGoal"] as? [String: Any] {
        var goal = SavingsGoalData()
        goal.name = goalObj["name"] as? String ?? "Goal"
        goal.savedAmount = goalObj["savedAmount"] as? Double ?? 0
        goal.targetAmount = goalObj["targetAmount"] as? Double ?? 0
        goal.percentage = goalObj["percentage"] as? Int ?? 0
        wd.nearestGoal = goal
    }

    return wd
}

func formatAmount(_ amount: Double, currency: String) -> String {
    let symbol: String
    switch currency {
    case "USD": symbol = "$"
    case "IDR": symbol = "Rp "
    case "EUR": symbol = "€"
    case "GBP": symbol = "£"
    case "JPY": symbol = "¥"
    case "MYR": symbol = "RM "
    case "SGD": symbol = "S$"
    case "AUD": symbol = "A$"
    case "CAD": symbol = "C$"
    default: symbol = currency + " "
    }
    let absVal = Swift.abs(amount)
    let prefix = amount < 0 ? "-" : ""
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = (absVal >= 1000 || ["IDR", "JPY", "KRW", "VND"].contains(currency)) ? 0 : 2
    formatter.minimumFractionDigits = 0
    let numStr = formatter.string(from: NSNumber(value: absVal)) ?? String(format: "%.0f", absVal)
    return "\(prefix)\(symbol)\(numStr)"
}

// ─── Quick Actions Widget ──────────────────────────────────────────────────────

struct QuickActionsEntry: TimelineEntry {
    let date: Date
}

struct QuickActionsProvider: TimelineProvider {
    func placeholder(in context: Context) -> QuickActionsEntry {
        QuickActionsEntry(date: Date())
    }
    func getSnapshot(in context: Context, completion: @escaping (QuickActionsEntry) -> Void) {
        completion(QuickActionsEntry(date: Date()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<QuickActionsEntry>) -> Void) {
        let entry = QuickActionsEntry(date: Date())
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct QuickActionsWidgetView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.05, green: 0.07, blue: 0.12), Color(red: 0.08, green: 0.05, blue: 0.15)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(alignment: .leading, spacing: 6) {
                // Header
                HStack(spacing: 5) {
                    Image(systemName: "bolt.fill")
                        .foregroundColor(Color(red: 1, green: 0.4, blue: 0))
                        .font(.system(size: 10, weight: .bold))
                    Text("FinanceFlow")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.white.opacity(0.6))
                    Spacer()
                }
                .padding(.bottom, 4)

                // Three action buttons
                HStack(spacing: 8) {
                    ActionButton(
                        systemImage: "plus.circle.fill",
                        label: "Expense",
                        url: "financeflow://add-transaction",
                        color: Color(red: 1, green: 0.4, blue: 0)
                    )
                    ActionButton(
                        systemImage: "camera.fill",
                        label: "Receipt",
                        url: "financeflow://receipt-scanner",
                        color: Color(red: 0.13, green: 0.7, blue: 0.53)
                    )
                    ActionButton(
                        systemImage: "arrow.up.circle.fill",
                        label: "Savings",
                        url: "financeflow://savings?action=add",
                        color: Color(red: 0.36, green: 0.45, blue: 0.9)
                    )
                }
            }
            .padding(14)
        }
    }
}

struct ActionButton: View {
    var systemImage: String
    var label: String
    var url: String
    var color: Color

    var body: some View {
        Link(destination: URL(string: url)!) {
            VStack(spacing: 5) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(color.opacity(0.15))
                        .frame(width: 42, height: 42)
                    Image(systemName: systemImage)
                        .foregroundColor(color)
                        .font(.system(size: 18, weight: .semibold))
                }
                Text(label)
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(.white.opacity(0.75))
            }
            .frame(maxWidth: .infinity)
        }
    }
}

struct QuickActionsWidget: Widget {
    let kind = "FinanceFlowQuickActions"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: QuickActionsProvider()) { _ in
            if #available(iOS 17.0, *) {
                QuickActionsWidgetView()
                    .containerBackground(for: .widget) {
                        Color(red: 0.05, green: 0.07, blue: 0.12)
                    }
            } else {
                QuickActionsWidgetView()
            }
        }
        .configurationDisplayName("Quick Actions")
        .description("One-tap log expense, scan receipt, or add savings.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// ─── Daily Allowance Widget ────────────────────────────────────────────────────

struct AllowanceEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

struct AllowanceProvider: TimelineProvider {
    func placeholder(in context: Context) -> AllowanceEntry {
        AllowanceEntry(date: Date(), data: WidgetData())
    }
    func getSnapshot(in context: Context, completion: @escaping (AllowanceEntry) -> Void) {
        completion(AllowanceEntry(date: Date(), data: loadWidgetData()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<AllowanceEntry>) -> Void) {
        let data = loadWidgetData()
        let entry = AllowanceEntry(date: Date(), data: data)
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct DailyAllowanceWidgetView: View {
    var entry: AllowanceEntry

    var allowance: DailyAllowanceData { entry.data.allowance }
    var nearestGoal: SavingsGoalData? { entry.data.nearestGoal }

    var barColor: Color {
        switch allowance.percentage {
        case ..<70:  return Color(red: 0.13, green: 0.7, blue: 0.38)
        case ..<100: return Color(red: 1, green: 0.4, blue: 0)
        default:     return Color(red: 0.93, green: 0.27, blue: 0.27)
        }
    }

    var body: some View {
        Link(destination: URL(string: "financeflow://")!) {
            ZStack {
                LinearGradient(
                    colors: [Color(red: 0.05, green: 0.07, blue: 0.12), Color(red: 0.08, green: 0.05, blue: 0.15)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                VStack(alignment: .leading, spacing: 4) {
                    // Header
                    HStack(spacing: 4) {
                        Image(systemName: "chart.bar.fill")
                            .foregroundColor(Color(red: 1, green: 0.4, blue: 0))
                            .font(.system(size: 9, weight: .bold))
                        Text("Today's Budget")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(.white.opacity(0.55))
                        Spacer()
                    }

                    Spacer()

                    // Remaining amount
                    Text(formatAmount(allowance.remaining, currency: allowance.currency))
                        .font(.system(size: 26, weight: .black, design: .rounded))
                        .foregroundColor(barColor)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)

                    Text(allowance.remaining >= 0 ? "remaining today" : "over budget")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                        .padding(.bottom, 4)

                    // Progress bar
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 3)
                                .fill(.white.opacity(0.12))
                                .frame(height: 5)
                            RoundedRectangle(cornerRadius: 3)
                                .fill(barColor)
                                .frame(width: geo.size.width * CGFloat(min(allowance.percentage, 100)) / 100.0, height: 5)
                        }
                    }
                    .frame(height: 5)
                    .padding(.bottom, 3)

                    // Spent / Budget row
                    HStack {
                        Text("Spent: \(formatAmount(allowance.todaySpent, currency: allowance.currency))")
                            .font(.system(size: 8, weight: .regular))
                            .foregroundColor(.white.opacity(0.45))
                        Spacer()
                        Text("Budget: \(formatAmount(allowance.dailyBudget, currency: allowance.currency))")
                            .font(.system(size: 8, weight: .regular))
                            .foregroundColor(.white.opacity(0.45))
                    }

                    // Nearest savings goal reminder
                    if let goal = nearestGoal {
                        Divider().background(.white.opacity(0.1)).padding(.vertical, 3)
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.up.circle.fill")
                                .foregroundColor(Color(red: 0.36, green: 0.45, blue: 0.9))
                                .font(.system(size: 9))
                            Text("\(goal.name): \(goal.percentage)%")
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(.white.opacity(0.65))
                                .lineLimit(1)
                            Spacer()
                            Text("Add savings →")
                                .font(.system(size: 8, weight: .medium))
                                .foregroundColor(Color(red: 0.36, green: 0.45, blue: 0.9))
                        }
                    }
                }
                .padding(12)
            }
        }
    }
}

struct DailyAllowanceWidget: Widget {
    let kind = "FinanceFlowDailyAllowance"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AllowanceProvider()) { entry in
            if #available(iOS 17.0, *) {
                DailyAllowanceWidgetView(entry: entry)
                    .containerBackground(for: .widget) {
                        Color(red: 0.05, green: 0.07, blue: 0.12)
                    }
            } else {
                DailyAllowanceWidgetView(entry: entry)
            }
        }
        .configurationDisplayName("Daily Allowance")
        .description("Today's remaining budget at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// ─── Widget Bundle ─────────────────────────────────────────────────────────────

@main
struct FinanceFlowWidgetBundle: WidgetBundle {
    var body: some Widget {
        QuickActionsWidget()
        DailyAllowanceWidget()
    }
}
