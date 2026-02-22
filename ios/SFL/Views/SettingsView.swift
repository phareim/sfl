import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var settings: Settings
    var onboardingMode: Bool = false

    @State private var apiUrl = ""
    @State private var apiKey = ""
    @State private var saved = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 32) {
                    if onboardingMode {
                        onboardingHeader
                    }

                    fieldSection
                    saveButton
                }
                .padding(24)
            }
            .background(Color.sflBg)
            .navigationTitle(onboardingMode ? "" : "Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
        .onAppear {
            apiUrl = settings.apiUrl
            apiKey = settings.apiKey
        }
    }

    // MARK: - Sub-views

    private var onboardingHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("SFL")
                .font(.system(size: 48, weight: .black))
                .foregroundStyle(Color.sflAccent)
            Text("Save For Later")
                .font(.sflHeading)
                .foregroundStyle(Color.sflMuted)
            Text("Connect to your API to get started.")
                .font(.sflBody)
                .foregroundStyle(Color.sflText)
        }
        .padding(.bottom, 8)
    }

    private var fieldSection: some View {
        VStack(alignment: .leading, spacing: 20) {
            SFLField(label: "API URL", placeholder: "https://sfl.yourname.workers.dev", text: $apiUrl)
            SFLField(label: "API KEY", placeholder: "Bearer token", text: $apiKey, secure: true)
        }
    }

    private var saveButton: some View {
        Button {
            settings.apiUrl = apiUrl.trimmingCharacters(in: .whitespacesAndNewlines)
            settings.apiKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
            withAnimation { saved = true }
            Task {
                try? await Task.sleep(for: .seconds(2))
                await MainActor.run { saved = false }
            }
        } label: {
            HStack {
                Spacer()
                Text(saved ? "Saved ✓" : "Save")
                Spacer()
            }
        }
        .buttonStyle(SFLButtonStyle(variant: .primary))
        .disabled(apiUrl.isEmpty || apiKey.isEmpty)
    }
}

// MARK: - Field Component

struct SFLField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var secure: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.sflLabel)
                .tracking(1)
                .foregroundStyle(Color.sflMuted)

            Group {
                if secure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                }
            }
            .font(.sflBody)
            .padding(12)
            .background(Color.sflSurface)
            .foregroundStyle(Color.sflText)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(Color.sflStroke, lineWidth: 2)
            )
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
    }
}
