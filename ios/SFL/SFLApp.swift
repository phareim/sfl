import SwiftUI

@main
struct SFLApp: App {
    @StateObject private var settings = Settings.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(settings)
                .preferredColorScheme(nil) // respect system
        }
    }
}
