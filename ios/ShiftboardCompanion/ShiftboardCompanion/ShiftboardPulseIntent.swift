import AppIntents

struct ShiftboardPulseIntent: AppIntent {
    static var title: LocalizedStringResource = "Shiftboard Business Pulse"
    static var description = IntentDescription("Reads the latest Shiftboard workshop sales position.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let pulse: BusinessPulse
        if let live = try? await ShiftboardAPI.shared.fetchPulse() {
            pulse = live
        } else if let cached = SharedStore.loadPulse() {
            pulse = cached
        } else {
            return .result(dialog: "Open Shiftboard on your iPhone and sign in first.")
        }

        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "GBP"
        formatter.maximumFractionDigits = 0

        let sales = formatter.string(from: pulse.sales as NSNumber) ?? "£0"
        let target = formatter.string(from: pulse.target as NSNumber) ?? "£0"
        let variance = formatter.string(from: abs(pulse.variance) as NSNumber) ?? "£0"
        let direction = pulse.variance >= 0 ? "ahead" : "behind"
        let freshness = pulse.stale && pulse.asOf != nil ? " Latest saved data is from \(pulse.asOf!)." : ""

        return .result(
            dialog: "Workshop sales are \(sales) against a target of \(target), \(direction) by \(variance). \(pulse.ahead) workshops are ahead and \(pulse.behind) are behind.\(freshness)"
        )
    }
}

struct ShiftboardShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ShiftboardPulseIntent(),
            phrases: [
                "How are the workshops doing in \(.applicationName)",
                "What's the business pulse in \(.applicationName)",
                "Check \(.applicationName)"
            ],
            shortTitle: "Business Pulse",
            systemImageName: "chart.line.uptrend.xyaxis"
        )
    }
}
