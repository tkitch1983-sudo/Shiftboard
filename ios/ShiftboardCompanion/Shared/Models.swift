import Foundation

struct BusinessPulse: Codable, Hashable {
    struct SitePulse: Codable, Hashable, Identifiable {
        let id: String
        let name: String
        let sales: Double?
        let target: Double
        let variance: Double?
        let attainment: Double?
        let trading: Bool
        let dataAvailable: Bool
    }

    struct AttentionItem: Codable, Hashable {
        let name: String
        let variance: Double?
    }

    let asOf: String?
    let today: String
    let stale: Bool
    let sales: Double
    let target: Double
    let variance: Double
    let attainment: Double?
    let workshops: Int
    let trading: Int
    let ahead: Int
    let behind: Int
    let topSite: SitePulse?
    let attention: [AttentionItem]
    let sites: [SitePulse]
    let generatedAt: String

    static let placeholder = BusinessPulse(
        asOf: nil,
        today: "",
        stale: true,
        sales: 0,
        target: 0,
        variance: 0,
        attainment: nil,
        workshops: 8,
        trading: 0,
        ahead: 0,
        behind: 0,
        topSite: nil,
        attention: [],
        sites: [],
        generatedAt: ""
    )
}

struct SessionTokens: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
}
