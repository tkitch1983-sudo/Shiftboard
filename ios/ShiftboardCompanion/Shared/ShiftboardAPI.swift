import Foundation

actor ShiftboardAPI {
    static let shared = ShiftboardAPI()

    private let baseURL = URL(string: "https://disgpocvqitpeceqhuim.supabase.co")!
    private let publishableKey = "sb_publishable_4L6l31SywNvyXrYQdXj4DQ_yz-Td6Xk"
    private let sessionAccount = "manager-session-v1"

    enum APIError: LocalizedError {
        case invalidResponse
        case signedOut
        case server(String)

        var errorDescription: String? {
            switch self {
            case .invalidResponse:
                return "Shiftboard returned an invalid response."
            case .signedOut:
                return "Please sign in to Shiftboard."
            case .server(let message):
                return message
            }
        }
    }

    private struct AuthResponse: Decodable {
        let access_token: String
        let refresh_token: String
        let expires_in: Double?
    }

    private struct ErrorResponse: Decodable {
        let error: String?
        let message: String?
        let error_description: String?
        let msg: String?

        var displayMessage: String {
            error_description ?? message ?? msg ?? error ?? "Shiftboard request failed."
        }
    }

    func hasSession() -> Bool {
        loadSession() != nil
    }

    func signIn(email: String, password: String) async throws -> BusinessPulse {
        let url = baseURL.appending(path: "auth/v1/token").appending(queryItems: [
            URLQueryItem(name: "grant_type", value: "password")
        ])
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode([
            "email": email.trimmingCharacters(in: .whitespacesAndNewlines),
            "password": password,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        try ensureSuccess(response: response, data: data)

        let auth = try JSONDecoder().decode(AuthResponse.self, from: data)
        let session = SessionTokens(
            accessToken: auth.access_token,
            refreshToken: auth.refresh_token,
            expiresAt: Date().addingTimeInterval(auth.expires_in ?? 3600)
        )
        try saveSession(session)
        return try await fetchPulse()
    }

    func signOut() {
        SharedKeychain.delete(account: sessionAccount)
        SharedStore.clearPulse()
    }

    func fetchPulse() async throws -> BusinessPulse {
        let accessToken = try await currentAccessToken()
        let url = baseURL.appending(path: "functions/v1/shiftboard-car-pulse")

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await URLSession.shared.data(for: request)
        try ensureSuccess(response: response, data: data)

        let pulse = try JSONDecoder().decode(BusinessPulse.self, from: data)
        SharedStore.savePulse(pulse)
        return pulse
    }

    private func currentAccessToken() async throws -> String {
        guard var session = loadSession() else { throw APIError.signedOut }
        if session.expiresAt.timeIntervalSinceNow > 90 {
            return session.accessToken
        }

        let url = baseURL.appending(path: "auth/v1/token").appending(queryItems: [
            URLQueryItem(name: "grant_type", value: "refresh_token")
        ])
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["refresh_token": session.refreshToken])

        let (data, response) = try await URLSession.shared.data(for: request)
        try ensureSuccess(response: response, data: data)

        let auth = try JSONDecoder().decode(AuthResponse.self, from: data)
        session = SessionTokens(
            accessToken: auth.access_token,
            refreshToken: auth.refresh_token,
            expiresAt: Date().addingTimeInterval(auth.expires_in ?? 3600)
        )
        try saveSession(session)
        return session.accessToken
    }

    private func loadSession() -> SessionTokens? {
        guard let data = SharedKeychain.load(account: sessionAccount) else { return nil }
        return try? JSONDecoder().decode(SessionTokens.self, from: data)
    }

    private func saveSession(_ session: SessionTokens) throws {
        let data = try JSONEncoder().encode(session)
        try SharedKeychain.save(data, account: sessionAccount)
    }

    private func ensureSuccess(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorResponse.self, from: data).displayMessage)
                ?? "Shiftboard request failed (\(http.statusCode))."
            if http.statusCode == 401 {
                SharedKeychain.delete(account: sessionAccount)
                throw APIError.signedOut
            }
            throw APIError.server(message)
        }
    }
}

private extension URL {
    func appending(queryItems: [URLQueryItem]) -> URL {
        guard var components = URLComponents(url: self, resolvingAgainstBaseURL: false) else {
            return self
        }
        components.queryItems = (components.queryItems ?? []) + queryItems
        return components.url ?? self
    }
}
