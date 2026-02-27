import SwiftUI

struct SettingsView: View {
    @ObservedObject private var settings = Settings.shared
    @State private var url: String = ""
    @State private var key: String = ""
    @State private var saved = false

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack {
                Text("SFL").font(.sflHeading).foregroundStyle(Color.sflAccent)
                Text("Settings").font(.sflHeading).foregroundStyle(Color.sflText)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("API URL").font(.sflLabel).tracking(1).foregroundStyle(Color.sflMuted)
                TextField("https://your-worker.workers.dev", text: $url)
                    .textFieldStyle(.plain)
                    .font(.sflBody)
                    .padding(10)
                    .background(Color.sflSurface)
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.sflStroke, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("API KEY").font(.sflLabel).tracking(1).foregroundStyle(Color.sflMuted)
                SecureField("Bearer token", text: $key)
                    .textFieldStyle(.plain)
                    .font(.sflBody)
                    .padding(10)
                    .background(Color.sflSurface)
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.sflStroke, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }

            HStack {
                Spacer()
                if saved {
                    Text("Saved ✓").font(.sflBody).foregroundStyle(Color.sflAccent)
                }
                Button("Save") {
                    settings.apiUrl = url
                    settings.apiKey = key
                    saved = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { saved = false }
                }
                .buttonStyle(SFLPrimaryButton())
                .disabled(url.isEmpty || key.isEmpty)
            }

            Text("Global shortcut: ⌃⌥I (Control + Option + I)")
                .font(.sflSmall)
                .foregroundStyle(Color.sflMuted)
        }
        .padding(24)
        .frame(width: 400)
        .background(Color.sflBg)
        .onAppear {
            url = settings.apiUrl
            key = settings.apiKey
        }
    }
}
