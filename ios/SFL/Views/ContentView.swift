import SwiftUI

struct ContentView: View {
    @EnvironmentObject var settings: Settings
    @State private var selectedTab = 0

    var body: some View {
        if !settings.isConfigured {
            SettingsView(onboardingMode: true)
        } else {
            TabView(selection: $selectedTab) {
                IdeasListView()
                    .tabItem { Label("Ideas", systemImage: "lightbulb") }
                    .tag(0)
                ChatView(onClose: { selectedTab = 0 })
                    .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
                    .tag(1)
                SettingsView()
                    .tabItem { Label("Settings", systemImage: "gear") }
                    .tag(2)
            }
        }
    }
}
