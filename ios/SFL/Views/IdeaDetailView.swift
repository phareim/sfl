import SwiftUI

// MARK: - View Model

@MainActor
final class IdeaDetailViewModel: ObservableObject {
    @Published var idea: IdeaDetail?
    @Published var isLoading = false
    @Published var error: String?

    func load(id: String) {
        Task {
            isLoading = true
            error = nil
            do {
                idea = try await APIClient.shared.getIdea(id: id)
            } catch {
                self.error = error.localizedDescription
            }
            isLoading = false
        }
    }
}

// MARK: - View

struct IdeaDetailView: View {
    let id: String
    @StateObject private var vm = IdeaDetailViewModel()

    var body: some View {
        Group {
            if vm.isLoading {
                ProgressView().tint(Color.sflAccent)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = vm.error {
                errorView(error)
            } else if let idea = vm.idea {
                ideaContent(idea)
            }
        }
        .background(Color.sflBg)
        .task { vm.load(id: id) }
    }

    // MARK: - Main content

    private func ideaContent(_ idea: IdeaDetail) -> some View {
        let type = idea.type.ideaType
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Type-colored accent bar + header
                header(idea, type: type)
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 24)

                // Content section
                if let content = contentText(idea) {
                    sectionBlock(label: "CONTENT") {
                        Text(content)
                            .font(.sflBody)
                            .foregroundStyle(Color.sflText)
                            .lineSpacing(4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.bottom, 20)
                }

                // URL
                if let url = idea.url {
                    sectionBlock(label: "SOURCE") {
                        Link(destination: URL(string: url) ?? URL(string: "https://example.com")!) {
                            Text(url)
                                .font(.sflSmall)
                                .foregroundStyle(Color.sflAccent)
                                .lineLimit(2)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(.bottom, 20)
                }

                // Tags
                if !idea.tags.isEmpty {
                    sectionBlock(label: "TAGS") {
                        FlowLayout(spacing: 8) {
                            ForEach(idea.tags) { conn in
                                NavigationLink(destination: IdeaDetailView(id: conn.idea.id)) {
                                    TagPill(title: conn.idea.displayTitle)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.bottom, 20)
                }

                // Notes
                if let notes = idea.notes, !notes.isEmpty {
                    sectionBlock(label: "NOTES") {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(notes) { note in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(note.body)
                                        .font(.sflBody)
                                        .foregroundStyle(Color.sflText)
                                    Text(note.formattedDate)
                                        .font(.sflMeta)
                                        .foregroundStyle(Color.sflMuted)
                                }
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.sflSurface)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 4)
                                        .strokeBorder(Color.sflStroke, lineWidth: 1)
                                )
                            }
                        }
                    }
                    .padding(.bottom, 20)
                }

                // Connections
                if !idea.relatedConnections.isEmpty {
                    sectionBlock(label: "CONNECTIONS") {
                        VStack(spacing: 8) {
                            ForEach(idea.relatedConnections) { conn in
                                NavigationLink(destination: IdeaDetailView(id: conn.idea.id)) {
                                    ConnectionRow(connection: conn)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.bottom, 20)
                }

                Spacer(minLength: 60)
            }
        }
    }

    // MARK: - Header

    private func header(_ idea: IdeaDetail, type: IdeaType) -> some View {
        HStack(alignment: .top, spacing: 0) {
            // Left type-color bar
            Rectangle()
                .fill(type.color)
                .frame(width: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))

            VStack(alignment: .leading, spacing: 10) {
                // Type badge + date
                HStack(spacing: 8) {
                    HStack(spacing: 4) {
                        Text(type.icon)
                            .font(.system(size: 12))
                        Text(type.label)
                            .font(.sflLabel)
                            .tracking(1)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .overlay(
                        RoundedRectangle(cornerRadius: 4)
                            .strokeBorder(type.color, lineWidth: 2)
                    )
                    .foregroundStyle(type.color)

                    Spacer()

                    Text(idea.formattedDate)
                        .font(.sflMeta)
                        .foregroundStyle(Color.sflMuted)
                }

                // Title
                Text(idea.displayTitle)
                    .font(.system(size: 26, weight: .heavy))
                    .foregroundStyle(Color.sflText)
                    .lineLimit(nil)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.leading, 16)
        }
    }

    // MARK: - Section block

    private func sectionBlock<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(label)
                    .font(.sflLabel)
                    .tracking(1.5)
                    .foregroundStyle(Color.sflMuted)
                Spacer()
            }
            .padding(.bottom, 2)
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(Color.sflStroke)
                    .frame(height: 2)
            }

            content()
        }
        .padding(.horizontal, 20)
    }

    // MARK: - Content text helper

    private func contentText(_ idea: IdeaDetail) -> String? {
        guard let data = idea.data else { return idea.summary }
        return data.text ?? data.body ?? data.excerpt ?? idea.summary
    }

    // MARK: - Error

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Text("⚠️").font(.system(size: 40))
            Text(msg)
                .font(.sflBody)
                .foregroundStyle(Color.sflMuted)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Tag Pill

struct TagPill: View {
    let title: String

    var body: some View {
        Text("#\(title)")
            .font(.sflSmall)
            .foregroundStyle(Color.sflMuted)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(Color.sflStroke, lineWidth: 1)
            )
    }
}

// MARK: - Connection Row

struct ConnectionRow: View {
    let connection: Connection

    var body: some View {
        let type = connection.idea.type.ideaType
        HStack {
            Text(type.icon).font(.system(size: 13))
            Text(connection.idea.displayTitle)
                .font(.sflCardTitle)
                .foregroundStyle(Color.sflText)
                .lineLimit(1)
            Spacer()
            if let label = connection.label {
                Text(label.replacingOccurrences(of: "_", with: " "))
                    .font(.sflMeta)
                    .foregroundStyle(Color.sflMuted)
            }
            Image(systemName: "chevron.right")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(Color.sflMuted)
        }
        .padding(12)
        .sflCard(typeColor: type.color)
    }
}

// MARK: - Flow Layout (for tags)

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowH: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > width, x > 0 {
                y += rowH + spacing
                x = 0
                rowH = 0
            }
            x += size.width + spacing
            rowH = max(rowH, size.height)
        }
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var rowH: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                y += rowH + spacing
                x = bounds.minX
                rowH = 0
            }
            view.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
            x += size.width + spacing
            rowH = max(rowH, size.height)
        }
    }
}
