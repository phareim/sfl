import SwiftUI

struct ContentView: View {
    @EnvironmentObject var settings: Settings

    var body: some View {
        if settings.isConfigured {
            IdeasListView()
        } else {
            SettingsView(onboardingMode: true)
        }
    }
}
