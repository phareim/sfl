import Foundation

/// Shared settings stored in App Group UserDefaults so both the main app
/// and the Share Extension can read/write them.
///
/// Replace APP_GROUP_ID with your actual App Group identifier in SETUP.md.
final class Settings: ObservableObject {
    static let shared = Settings()

    // Keep in sync with ShareExtension target and Xcode capabilities.
    // Format: group.<your-bundle-id>
    static let appGroupID = "group.no.phareim.sfl"

    private let defaults: UserDefaults

    private init() {
        defaults = UserDefaults(suiteName: Self.appGroupID) ?? .standard
    }

    var apiUrl: String {
        get { defaults.string(forKey: "sfl_api_url") ?? "" }
        set {
            objectWillChange.send()
            defaults.set(newValue, forKey: "sfl_api_url")
        }
    }

    var apiKey: String {
        get { defaults.string(forKey: "sfl_api_key") ?? "" }
        set {
            objectWillChange.send()
            defaults.set(newValue, forKey: "sfl_api_key")
        }
    }

    var isConfigured: Bool { !apiUrl.isEmpty && !apiKey.isEmpty }
}
