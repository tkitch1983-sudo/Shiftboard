import SwiftUI
import WidgetKit

struct ShiftboardWidgetEntry: TimelineEntry {
    let date: Date
    let pulse: BusinessPulse?
}

struct ShiftboardWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> ShiftboardWidgetEntry {
        ShiftboardWidgetEntry(date: .now, pulse: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (ShiftboardWidgetEntry) -> Void) {
        completion(
            ShiftboardWidgetEntry(
                date: .now,
                pulse: SharedStore.loadPulse() ?? .placeholder
            )
        )
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ShiftboardWidgetEntry>) -> Void) {
        Task {
            let pulse = (try? await ShiftboardAPI.shared.fetchPulse()) ?? SharedStore.loadPulse()
            let entry = ShiftboardWidgetEntry(date: .now, pulse: pulse)
            let nextUpdate = Date().addingTimeInterval(15 * 60)
            completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
        }
    }
}

struct ShiftboardWidgetView: View {
    let entry: ShiftboardWidgetEntry

    private let currency = FloatingPointFormatStyle<Double>.Currency(code: "GBP")
        .precision(.fractionLength(0))

    var body: some View {
        if let pulse = entry.pulse {
            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 5) {
                    Circle()
                        .fill(pulse.stale ? Color.orange : Color.green)
                        .frame(width: 7, height: 7)
                    Text("SHIFTBOARD")
                        .font(.caption2.weight(.heavy))
                        .tracking(0.6)
                    Spacer(minLength: 0)
                }

                Text(pulse.sales, format: currency)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.72)
                    .lineLimit(1)

                HStack(alignment: .firstTextBaseline) {
                    Text("Target")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(pulse.target, format: currency)
                        .font(.caption.bold().monospacedDigit())
                }

                Divider()

                HStack {
                    Text(pulse.variance >= 0 ? "AHEAD" : "BEHIND")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(pulse.variance >= 0 ? .green : .red)
                    Spacer()
                    Text(abs(pulse.variance), format: currency)
                        .font(.caption.bold().monospacedDigit())
                        .foregroundStyle(pulse.variance >= 0 ? .green : .red)
                }

                Text("\(pulse.ahead) ahead · \(pulse.behind) behind")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .widgetURL(URL(string: "shiftboard://pulse"))
            .containerBackground(.background, for: .widget)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Text("SHIFTBOARD")
                    .font(.caption2.weight(.heavy))
                Text("Open Shiftboard on your iPhone and sign in.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .containerBackground(.background, for: .widget)
        }
    }
}

struct ShiftboardWidget: Widget {
    let kind = "ShiftboardBusinessPulse"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ShiftboardWidgetProvider()) { entry in
            ShiftboardWidgetView(entry: entry)
        }
        .configurationDisplayName("Shiftboard Business Pulse")
        .description("Sales, target and workshop performance at a glance.")
        .supportedFamilies([.systemSmall])
    }
}
