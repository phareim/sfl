import SwiftUI

struct ContentView: View {
    @EnvironmentObject var settings: Settings

    var body: some View {
        if !settings.isConfigured {
            SettingsView(onboardingMode: true)
        } else {
            TabView {
                IdeasListView()
                    .tabItem { Label("Ideas", systemImage: "lightbulb") }
                ChatView()
                    .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
                SettingsView()
                    .tabItem { Label("Settings", systemImage: "gear") }
            }
        }
    }
}
