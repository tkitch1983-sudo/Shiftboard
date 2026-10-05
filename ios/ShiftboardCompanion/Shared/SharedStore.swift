import Foundation

enum SharedStore {
    static let appGroup = "group.com.neautoservices.shiftboard"
    private static let pulseKey = "shiftboard.businessPulse.v1"

    private static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }

    static func savePulse(_ pulse: BusinessPulse) {
        guard let data = try? JSONEncoder().encode(pulse) else { return }
        defaults.set(data, forKey: pulseKey)
    }

    static func loadPulse() -> BusinessPulse? {
        guard let data = defaults.data(forKey: pulseKey) else { return nil }
        return try? JSONDecoder().decode(BusinessPulse.self, from: data)
    }

    static func clearPulse() {
        defaults.removeObject(forKey: pulseKey)
    }
}
