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
            if let de = e as? DecodingError {
                switch de {
                case .keyNotFound(let key, let ctx):
                    return "Missing key '\(key.stringValue)' at path: \(ctx.codingPath.map(\.stringValue).joined(separator: "."))"
                case .typeMismatch(_, let ctx):
                    return "Type mismatch at path: \(ctx.codingPath.map(\.stringValue).joined(separator: "."))"
                case .valueNotFound(_, let ctx):
                    return "Null value at path: \(ctx.codingPath.map(\.stringValue).joined(separator: "."))"
                default:
                    return "Decode error: \(de)"
                }
            }
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

    private func deleteRequest(_ path: String) async throws {
        guard Settings.shared.isConfigured else { throw APIError.notConfigured }
        let url = URL(string: "\(baseURL)\(path)")!
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        let (data, response) = try await URLSession.shared.data(for: req)
        try checkResponse(response, data: data)
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

    func listIdeas(cursor: Int? = nil, type: String? = nil, query: String? = nil) async throws -> IdeasResponse {
        var parts: [String] = []
        if let c = cursor  { parts.append("cursor=\(c)") }
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
    func createIdea(type: String, title: String?, url: String?, summary: String? = nil, data: [String: String?]? = nil) async throws -> Idea {
        let body = CreateIdeaBody(type: type, title: title, url: url, summary: summary, data: data)
        let response: CreateResponse = try await post("/api/ideas", body: body)
        return response.idea
    }

    func deleteConnection(id: String) async throws {
        try await deleteRequest("/api/connections/\(id)")
    }

    func addNote(ideaId: String, body: String) async throws -> Note {
        struct Body: Encodable { let body: String }
        struct Resp: Decodable { let note: Note }
        let resp: Resp = try await post("/api/ideas/\(ideaId)/notes", body: Body(body: body))
        return resp.note
    }

    func deleteNote(id: String) async throws {
        try await deleteRequest("/api/notes/\(id)")
    }

    func deleteIdea(id: String) async throws {
        try await deleteRequest("/api/ideas/\(id)")
    }

    func fetchContent(ideaId: String) async throws {
        struct Empty: Encodable {}
        struct Resp: Decodable { let data: IdeaData }
        let _: Resp = try await post("/api/ideas/\(ideaId)/fetch-content", body: Empty())
    }

    func enrichIdea(id: String, mode: String) async throws {
        struct Empty: Encodable {}
        struct Resp: Decodable { let connections: [Connection] }
        let _: Resp = try await post("/api/ideas/\(id)/enrich?mode=\(mode)", body: Empty())
    }

    func listTags() async throws -> [Idea] {
        struct Response: Decodable { let tags: [Idea] }
        let response: Response = try await get("/api/tags")
        return response.tags
    }

    func searchGitHubRepos(q: String) async throws -> [GitHubRepo] {
        struct Response: Decodable { let items: [GitHubRepo] }
        let response: Response = try await get("/api/github/repos?q=\(q.urlEncoded)")
        return response.items
    }

    func createConnection(fromId: String, toId: String, label: String) async throws {
        struct Body: Encodable { let from_id: String; let to_id: String; let label: String }
        struct Response: Decodable { let connection: Min; struct Min: Decodable { let id: String } }
        let _: Response = try await post("/api/connections", body: Body(from_id: fromId, to_id: toId, label: label))
    }
}

struct GitHubRepo: Decodable, Identifiable {
    let fullName: String
    let htmlUrl: String
    let description: String?
    let isPrivate: Bool

    var id: String { htmlUrl }

    enum CodingKeys: String, CodingKey {
        case fullName = "full_name"
        case htmlUrl = "html_url"
        case description
        case isPrivate = "private"
    }
}

private extension String {
    var urlEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }
}
