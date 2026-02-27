import Foundation

// MARK: - Idea (list item)

struct Idea: Codable, Identifiable {
    let id: String
    let type: String
    let title: String?
    let url: String?
    let summary: String?
    let createdAt: Int

    enum CodingKeys: String, CodingKey {
        case id, type, title, url, summary
        case createdAt = "created_at"
    }

    var displayTitle: String {
        title?.isEmpty == false ? title! : url ?? "(untitled)"
    }
}

// MARK: - Connection

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
}

// MARK: - API payloads

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
