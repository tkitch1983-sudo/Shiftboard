import SwiftUI
import WidgetKit

@MainActor
final class ShiftboardViewModel: ObservableObject {
    @Published var checkingSession = true
    @Published var signedIn = false
    @Published var pulse: BusinessPulse?
    @Published var errorMessage = ""
    @Published var loading = false

    func bootstrap() async {
        signedIn = await ShiftboardAPI.shared.hasSession()
        checkingSession = false
        if signedIn {
            await refresh()
        }
    }

    func signIn(email: String, password: String) async {
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Enter your Shiftboard email and password."
            return
        }

        loading = true
        errorMessage = ""
        defer { loading = false }

        do {
            pulse = try await ShiftboardAPI.shared.signIn(email: email, password: password)
            signedIn = true
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refresh() async {
        loading = true
        errorMessage = ""
        defer { loading = false }

        do {
            pulse = try await ShiftboardAPI.shared.fetchPulse()
            signedIn = true
            WidgetCenter.shared.reloadAllTimelines()
        } catch ShiftboardAPI.APIError.signedOut {
            signedIn = false
            pulse = nil
            errorMessage = "Please sign in again."
        } catch {
            pulse = SharedStore.loadPulse()
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        await ShiftboardAPI.shared.signOut()
        pulse = nil
        signedIn = false
        WidgetCenter.shared.reloadAllTimelines()
    }
}

struct ContentView: View {
    @StateObject private var model = ShiftboardViewModel()

    var body: some View {
        Group {
            if model.checkingSession {
                ProgressView("Opening Shiftboard…")
            } else if model.signedIn {
                DashboardView(model: model)
            } else {
                SignInView(model: model)
            }
        }
        .task {
            if model.checkingSession {
                await model.bootstrap()
            }
        }
    }
}

private struct SignInView: View {
    @ObservedObject var model: ShiftboardViewModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Shiftboard email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .textContentType(.username)
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                } header: {
                    Text("Manager sign in")
                } footer: {
                    Text("Uses the same account as the main Shiftboard. Your password is not stored on the phone.")
                }

                if !model.errorMessage.isEmpty {
                    Section {
                        Text(model.errorMessage)
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task { await model.signIn(email: email, password: password) }
                    } label: {
                        HStack {
                            Spacer()
                            if model.loading {
                                ProgressView()
                            } else {
                                Text("Sign in")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(model.loading)
                }
            }
            .navigationTitle("Shiftboard")
        }
    }
}

private struct DashboardView: View {
    @ObservedObject var model: ShiftboardViewModel

    private let currency = FloatingPointFormatStyle<Double>.Currency(code: "GBP")
        .precision(.fractionLength(0))

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if let pulse = model.pulse {
                        statusCard(pulse)
                        siteSection(pulse)
                    } else if model.loading {
                        ProgressView("Loading business pulse…")
                            .padding(.top, 40)
                    }

                    if !model.errorMessage.isEmpty {
                        Text(model.errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding()
            }
            .navigationTitle("Business Pulse")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        Task { await model.refresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .disabled(model.loading)

                    Menu {
                        Button("Sign out", role: .destructive) {
                            Task { await model.signOut() }
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
            .refreshable {
                await model.refresh()
            }
        }
    }

    @ViewBuilder
    private func statusCard(_ pulse: BusinessPulse) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label(
                    pulse.stale ? "Latest saved data" : "Live today",
                    systemImage: pulse.stale ? "clock.badge.exclamationmark" : "circle.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(pulse.stale ? .orange : .green)

                Spacer()

                if let asOf = pulse.asOf {
                    Text(asOf)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }

            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Sales")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(pulse.sales, format: currency)
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text("Target")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(pulse.target, format: currency)
                        .font(.title2.bold())
                }
            }

            Divider()

            HStack {
                metric("Variance", pulse.variance, pulse.variance >= 0 ? .green : .red)
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Workshops")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("\(pulse.ahead) ahead · \(pulse.behind) behind")
                        .font(.headline)
                }
            }
        }
        .padding(18)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18))
    }

    private func siteSection(_ pulse: BusinessPulse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Workshops")
                .font(.headline)

            ForEach(pulse.sites) { site in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(site.name)
                            .fontWeight(.semibold)
                        if let sales = site.sales {
                            Text(sales, format: currency)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            Text("No snapshot")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    Spacer()

                    if let variance = site.variance, site.target > 0 {
                        Text(variance, format: currency)
                            .font(.headline.monospacedDigit())
                            .foregroundStyle(variance >= 0 ? .green : .red)
                    } else {
                        Text("—")
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 6)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func metric(_ title: String, _ value: Double, _ colour: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value, format: currency)
                .font(.title2.bold().monospacedDigit())
                .foregroundStyle(colour)
        }
    }
}
