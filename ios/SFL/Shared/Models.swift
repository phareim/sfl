import Foundation

// MARK: - Idea (list item)

struct Idea: Codable, Identifiable {
    let id: String
    let type: String
    let title: String?
    let url: String?
    let summary: String?
    let createdAt: Int       // Unix ms from D1

    enum CodingKeys: String, CodingKey {
        case id, type, title, url, summary
        case createdAt = "created_at"
    }

    var displayTitle: String {
        title?.isEmpty == false ? title! : url ?? "(untitled)"
    }

    var formattedDate: String {
        let date = Date(timeIntervalSince1970: Double(createdAt) / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: .now)
    }
}

// MARK: - Idea Detail (single idea with content + connections)

struct IdeaDetail: Decodable, Identifiable {
    let id: String
    let type: String
    let title: String?
    let url: String?
    let summary: String?
    let createdAt: Int
    let data: IdeaData?
    let connections: [Connection]?
    let notes: [Note]?

    // API response: { idea: {id, type, ...}, data: {}, connections: [], notes: [], media: [] }
    private enum RootKeys: String, CodingKey { case idea, data, connections, notes }
    private enum IdeaKeys: String, CodingKey {
        case id, type, title, url, summary
        case createdAt = "created_at"
    }

    init(from decoder: Decoder) throws {
        let root = try decoder.container(keyedBy: RootKeys.self)
        let idea = try root.nestedContainer(keyedBy: IdeaKeys.self, forKey: .idea)
        id          = try idea.decode(String.self, forKey: .id)
        type        = try idea.decode(String.self, forKey: .type)
        title       = try idea.decodeIfPresent(String.self, forKey: .title)
        url         = try idea.decodeIfPresent(String.self, forKey: .url)
        summary     = try idea.decodeIfPresent(String.self, forKey: .summary)
        createdAt   = try idea.decode(Int.self, forKey: .createdAt)
        data        = try root.decodeIfPresent(IdeaData.self, forKey: .data)
        connections = try root.decodeIfPresent([Connection].self, forKey: .connections)
        notes       = try root.decodeIfPresent([Note].self, forKey: .notes)
    }

    var displayTitle: String {
        title?.isEmpty == false ? title! : url ?? "(untitled)"
    }

    var formattedDate: String {
        let date = Date(timeIntervalSince1970: Double(createdAt) / 1000)
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        return f.string(from: date)
    }

    var tags: [Connection] {
        connections?.filter { $0.label == "tagged_with" } ?? []
    }

    var relatedConnections: [Connection] {
        connections?.filter { $0.label != "tagged_with" } ?? []
    }
}

// MARK: - Idea Data (flexible R2 content blob)

struct IdeaData: Codable {
    // Shared fields across types
    let text: String?
    let html: String?
    let author: String?
    let source: String?
    let body: String?       // note content
    let excerpt: String?
    let markdown: Bool?     // true when text has been LLM-formatted as markdown

    // All keys accepted — unknown keys silently ignored
}

// MARK: - Connection
//
// The API returns flat columns from a JOIN — no nested idea object.
// Schema: { id, label, created_at, from_id, from_type, from_title, to_id, to_type, to_title }

struct Connection: Codable, Identifiable {
    let id: String
    let label: String?
    let fromId: String
    let fromType: String
    let fromTitle: String?
    let toId: String
    let toType: String
    let toTitle: String?

    enum CodingKeys: String, CodingKey {
        case id, label
        case fromId = "from_id"
        case fromType = "from_type"
        case fromTitle = "from_title"
        case toId = "to_id"
        case toType = "to_type"
        case toTitle = "to_title"
    }

    /// The idea on the other end of this connection from `ideaId`.
    func other(from ideaId: String) -> (id: String, type: String, title: String) {
        fromId == ideaId
            ? (toId, toType, toTitle ?? "")
            : (fromId, fromType, fromTitle ?? "")
    }
}

// MARK: - Note

struct Note: Codable, Identifiable {
    let id: String
    let body: String
    let createdAt: Int

    enum CodingKeys: String, CodingKey {
        case id, body
        case createdAt = "created_at"
    }

    var formattedDate: String {
        let date = Date(timeIntervalSince1970: Double(createdAt) / 1000)
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f.localizedString(for: date, relativeTo: .now)
    }
}

// MARK: - API Responses

struct IdeasResponse: Codable {
    let ideas: [Idea]
    let cursor: Int?

    enum CodingKeys: String, CodingKey {
        case ideas
        case cursor = "nextCursor"
    }
}

struct CreateIdeaBody: Codable {
    let type: String
    let title: String?
    let url: String?
    let summary: String?
    let data: [String: String?]?
}
