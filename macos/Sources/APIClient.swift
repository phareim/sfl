import Foundation

enum APIError: LocalizedError {
    case notConfigured
    case httpError(Int, String)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "API not configured — open Settings from the menu bar."
        case .httpError(let code, let msg):
            return "HTTP \(code): \(msg)"
        case .decodingError(let e):
            return "Parse error: \(e.localizedDescription)"
        }
    }
}

final class APIClient {
    static let shared = APIClient()
    private init() {}

    private let decoder = JSONDecoder()

    private var baseURL: String {
        Settings.shared.apiUrl.trimmingCharacters(in: .init(charactersIn: "/"))
    }

    private var headers: [String: String] {
        ["Authorization": "Bearer \(Settings.shared.apiKey)",
         "Content-Type": "application/json"]
    }

    // MARK: - HTTP helpers

    private func get<T: Decodable>(_ path: String) async throws -> T {
        guard Settings.shared.isConfigured else { throw APIError.notConfigured }
        let url = URL(string: "\(baseURL)\(path)")!
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data: data)
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.decodingError(error) }
    }

    private func post<B: Encodable, T: Decodable>(_ path: String, body: B) async throws -> T {
        guard Settings.shared.isConfigured else { throw APIError.notConfigured }
        let url = URL(string: "\(baseURL)\(path)")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: req)
        try check(response, data: data)
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.decodingError(error) }
    }

    private func check(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse, http.statusCode >= 400 else { return }
        let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
        throw APIError.httpError(http.statusCode, msg)
    }

    // MARK: - Public API

    struct CreateResponse: Decodable { let idea: Idea }

    @discardableResult
    func createIdea(type: String, title: String?, url: String?, summary: String? = nil, data: [String: String?]? = nil) async throws -> Idea {
        let body = CreateIdeaBody(type: type, title: title, url: url, summary: summary, data: data)
        let resp: CreateResponse = try await post("/api/ideas", body: body)
        return resp.idea
    }

    func listTags() async throws -> [Idea] {
        struct Resp: Decodable { let tags: [Idea] }
        let resp: Resp = try await get("/api/tags")
        return resp.tags
    }

    func createConnection(fromId: String, toId: String, label: String) async throws {
        struct Body: Encodable { let from_id: String; let to_id: String; let label: String }
        struct Resp: Decodable { let connection: Min; struct Min: Decodable { let id: String } }
        let _: Resp = try await post("/api/connections", body: Body(from_id: fromId, to_id: toId, label: label))
    }
}

private extension String {
    var urlEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }
}
