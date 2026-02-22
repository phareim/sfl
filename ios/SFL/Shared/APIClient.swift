import Foundation

// MARK: - Errors

enum APIError: LocalizedError {
    case notConfigured
    case httpError(Int, String)
    case decodingError(Error)

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "API not configured. Open Settings."
        case .httpError(let code, let msg):
            return "HTTP \(code): \(msg)"
        case .decodingError(let e):
            return "Parse error: \(e.localizedDescription)"
        }
    }
}

// MARK: - Client

final class APIClient {
    static let shared = APIClient()
    private init() {}

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        return d
    }()

    private var baseURL: String {
        Settings.shared.apiUrl.trimmingCharacters(in: .init(charactersIn: "/"))
    }

    private var headers: [String: String] {
        ["Authorization": "Bearer \(Settings.shared.apiKey)",
         "Content-Type": "application/json"]
    }

    // MARK: Fetch helpers

    private func get<T: Decodable>(_ path: String) async throws -> T {
        guard Settings.shared.isConfigured else { throw APIError.notConfigured }
        let url = URL(string: "\(baseURL)\(path)")!
        var req = URLRequest(url: url)
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkResponse(response, data: data)
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
        try checkResponse(response, data: data)
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.decodingError(error) }
    }

    private func checkResponse(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        if http.statusCode >= 400 {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw APIError.httpError(http.statusCode, msg)
        }
    }

    // MARK: Public API

    func listIdeas(cursor: String? = nil, type: String? = nil, query: String? = nil) async throws -> IdeasResponse {
        var parts: [String] = []
        if let c = cursor  { parts.append("cursor=\(c.urlEncoded)") }
        if let t = type, t != "all" { parts.append("type=\(t.urlEncoded)") }
        let qs = parts.isEmpty ? "" : "?\(parts.joined(separator: "&"))"

        if let q = query, !q.isEmpty {
            return try await get("/api/ideas/search?q=\(q.urlEncoded)")
        }
        return try await get("/api/ideas\(qs)")
    }

    func getIdea(id: String) async throws -> IdeaDetail {
        try await get("/api/ideas/\(id)")
    }

    struct CreateResponse: Decodable {
        let idea: Idea
    }

    @discardableResult
    func createIdea(type: String, title: String?, url: String?, summary: String? = nil) async throws -> Idea {
        let body = CreateIdeaBody(type: type, title: title, url: url, summary: summary, data: nil)
        let response: CreateResponse = try await post("/api/ideas", body: body)
        return response.idea
    }
}

private extension String {
    var urlEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }
}
