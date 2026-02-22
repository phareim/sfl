import SwiftUI

struct ContentView: View {
    @EnvironmentObject var settings: Settings

    var body: some View {
        if settings.isConfigured {
            TabView {
                IdeasListView()
                    .tabItem { Label("Ideas", systemImage: "lightbulb") }
                SettingsView()
                    .tabItem { Label("Settings", systemImage: "gearshape") }
            }
            .tint(Color.sflAccent)
        } else {
            SettingsView(onboardingMode: true)
        }
    }
}
