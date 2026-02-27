import Foundation

final class Settings: ObservableObject {
    static let shared = Settings()
    private let defaults = UserDefaults.standard

    var apiUrl: String {
        get { defaults.string(forKey: "sfl_api_url") ?? "" }
        set { objectWillChange.send(); defaults.set(newValue, forKey: "sfl_api_url") }
    }

    var apiKey: String {
        get { defaults.string(forKey: "sfl_api_key") ?? "" }
        set { objectWillChange.send(); defaults.set(newValue, forKey: "sfl_api_key") }
    }

    var isConfigured: Bool { !apiUrl.isEmpty && !apiKey.isEmpty }
}
