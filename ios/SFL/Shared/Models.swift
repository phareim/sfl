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

struct IdeaDetail: Codable, Identifiable {
    let id: String
    let type: String
    let title: String?
    let url: String?
    let summary: String?
    let createdAt: Int
    let data: IdeaData?
    let connections: [Connection]?
    let notes: [Note]?

    enum CodingKeys: String, CodingKey {
        case id, type, title, url, summary, data, connections, notes
        case createdAt = "created_at"
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

    // All keys accepted — unknown keys silently ignored
}

// MARK: - Connection

struct Connection: Codable, Identifiable {
    let id: String
    let label: String?
    let direction: String?  // "from" | "to"
    let idea: ConnectedIdea

    struct ConnectedIdea: Codable, Identifiable {
        let id: String
        let type: String
        let title: String?
        let url: String?

        var displayTitle: String { title ?? url ?? "(untitled)" }
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
    let cursor: String?
}

struct CreateIdeaBody: Codable {
    let type: String
    let title: String?
    let url: String?
    let summary: String?
    let data: [String: String]?
}
