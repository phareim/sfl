import SwiftUI

// MARK: - View Model

@MainActor
final class IdeaDetailViewModel: ObservableObject {
    @Published var idea: IdeaDetail?
    @Published var isLoading = true
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

    private func mutate(ideaId: String, _ op: @escaping () async throws -> Void) {
        Task {
            do {
                try await op()
                load(id: ideaId)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }

    func removeTag(ideaId: String, connectionId: String) {
        mutate(ideaId: ideaId) { try await APIClient.shared.deleteConnection(id: connectionId) }
    }

    func addTag(ideaId: String, tagId: String) {
        mutate(ideaId: ideaId) {
            try await APIClient.shared.createConnection(fromId: ideaId, toId: tagId, label: "tagged_with")
        }
    }

    func addNewTag(ideaId: String, name: String) {
        mutate(ideaId: ideaId) {
            let tag = try await APIClient.shared.createIdea(type: "tag", title: name, url: nil)
            try await APIClient.shared.createConnection(fromId: ideaId, toId: tag.id, label: "tagged_with")
        }
    }

    func addNote(ideaId: String, body: String) {
        mutate(ideaId: ideaId) { try await APIClient.shared.addNote(ideaId: ideaId, body: body) }
    }

    func deleteNote(ideaId: String, noteId: String) {
        mutate(ideaId: ideaId) { try await APIClient.shared.deleteNote(id: noteId) }
    }

    func deleteIdea(id: String) async throws {
        try await APIClient.shared.deleteIdea(id: id)
    }

    @Published var isFetchingContent = false

    func fetchContent(ideaId: String) {
        Task {
            isFetchingContent = true
            do {
                try await APIClient.shared.fetchContent(ideaId: ideaId)
                load(id: ideaId)
            } catch {
                self.error = error.localizedDescription
            }
            isFetchingContent = false
        }
    }
}

// MARK: - View

struct IdeaDetailView: View {
    let id: String
    @StateObject private var vm = IdeaDetailViewModel()
    @Environment(\.dismiss) private var dismiss

    @State private var showTagPicker = false
    @State private var newNoteText = ""
    @State private var showDeleteAlert = false

    var body: some View {
        ZStack {
            Color.sflBg.ignoresSafeArea()
            if vm.isLoading {
                ProgressView().tint(Color.sflAccent)
            } else if let error = vm.error {
                errorView(error)
            } else if let idea = vm.idea {
                ideaContent(idea)
            }
        }
        .task { vm.load(id: id) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showDeleteAlert = true } label: {
                    Image(systemName: "trash")
                }
                .foregroundStyle(.red)
                .opacity(vm.idea == nil ? 0 : 1)
            }
        }
        .alert("Delete this idea?", isPresented: $showDeleteAlert) {
            Button("Delete", role: .destructive) {
                Task {
                    try? await vm.deleteIdea(id: id)
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This cannot be undone.")
        }
        .sheet(isPresented: $showTagPicker) {
            if let idea = vm.idea {
                TagPickerSheet(
                    existingTagIds: Set(idea.tags.map(\.toId)),
                    onAddExisting: { tag in vm.addTag(ideaId: idea.id, tagId: tag.id) },
                    onAddNew: { name in vm.addNewTag(ideaId: idea.id, name: name) }
                )
            }
        }
    }

    // MARK: - Main content

    private func ideaContent(_ idea: IdeaDetail) -> some View {
        let type = idea.type.ideaType
        return ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header(idea, type: type)
                    .padding(.horizontal, 20)
                    .padding(.top, 20)
                    .padding(.bottom, 24)

                if let content = contentText(idea) {
                    sectionBlock(label: "CONTENT") {
                        Text(content)
                            .font(.sflBody)
                            .foregroundStyle(Color.sflText)
                            .lineSpacing(4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.bottom, 20)
                } else if idea.type == "page" {
                    sectionBlock(label: "CONTENT") {
                        Button { vm.fetchContent(ideaId: idea.id) } label: {
                            if vm.isFetchingContent {
                                HStack(spacing: 8) {
                                    ProgressView().tint(Color.sflAccent)
                                    Text("Fetching…").font(.sflBody).foregroundStyle(Color.sflMuted)
                                }
                            } else {
                                Label("Fetch article text", systemImage: "doc.text.magnifyingglass")
                                    .font(.sflBody)
                                    .foregroundStyle(Color.sflAccent)
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(vm.isFetchingContent)
                    }
                    .padding(.bottom, 20)
                }

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

                if idea.type == "tag" {
                    // Tag detail: list the ideas tagged with this tag
                    if !idea.tags.isEmpty {
                        sectionBlock(label: "IDEAS") {
                            VStack(spacing: 8) {
                                ForEach(idea.tags) { conn in
                                    let other = conn.other(from: idea.id)
                                    NavigationLink(destination: IdeaDetailView(id: other.id)) {
                                        HStack(spacing: 10) {
                                            Text(other.type.ideaType.icon).font(.system(size: 14))
                                            Text(other.title.isEmpty ? "(untitled)" : other.title)
                                                .font(.sflCardTitle)
                                                .foregroundStyle(Color.sflText)
                                                .lineLimit(2)
                                            Spacer()
                                            Image(systemName: "chevron.right")
                                                .font(.system(size: 11, weight: .semibold))
                                                .foregroundStyle(Color.sflMuted)
                                        }
                                        .padding(12)
                                        .sflCard(typeColor: other.type.ideaType.color)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        .padding(.bottom, 20)
                    }
                } else {
                    // Regular idea: removable tag pills + add button
                    sectionBlock(label: "TAGS") {
                        VStack(alignment: .leading, spacing: 10) {
                            if !idea.tags.isEmpty {
                                FlowLayout(spacing: 8) {
                                    ForEach(idea.tags) { conn in
                                        let tag = conn.other(from: idea.id)
                                        NavigationLink(destination: IdeaDetailView(id: tag.id)) {
                                            TagPill(title: tag.title)
                                        }
                                        .buttonStyle(.plain)
                                        .contextMenu {
                                            Button(role: .destructive) {
                                                vm.removeTag(ideaId: idea.id, connectionId: conn.id)
                                            } label: {
                                                Label("Remove tag", systemImage: "tag.slash")
                                            }
                                        }
                                    }
                                }
                            }
                            Button { showTagPicker = true } label: {
                                Label("Add tag", systemImage: "plus")
                                    .font(.sflSmall)
                                    .foregroundStyle(Color.sflMuted)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.bottom, 20)
                }

                // Notes — always shown so you can add
                sectionBlock(label: "NOTES") {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(idea.notes ?? []) { note in
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
                            .overlay(RoundedRectangle(cornerRadius: 4)
                                .strokeBorder(Color.sflStroke, lineWidth: 1))
                            .contextMenu {
                                Button(role: .destructive) {
                                    vm.deleteNote(ideaId: idea.id, noteId: note.id)
                                } label: {
                                    Label("Delete note", systemImage: "trash")
                                }
                            }
                        }

                        // Add note
                        HStack(alignment: .bottom, spacing: 8) {
                            TextField("Add a note…", text: $newNoteText, axis: .vertical)
                                .font(.sflBody)
                                .foregroundStyle(Color.sflText)
                                .lineLimit(1...4)
                            if !newNoteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                Button {
                                    let body = newNoteText.trimmingCharacters(in: .whitespacesAndNewlines)
                                    newNoteText = ""
                                    vm.addNote(ideaId: idea.id, body: body)
                                } label: {
                                    Image(systemName: "arrow.up.circle.fill")
                                        .font(.system(size: 24))
                                        .foregroundStyle(Color.sflAccent)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(12)
                        .background(Color.sflSurface)
                        .overlay(RoundedRectangle(cornerRadius: 4)
                            .strokeBorder(Color.sflStroke, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                }
                .padding(.bottom, 20)

                if !idea.relatedConnections.isEmpty {
                    sectionBlock(label: "CONNECTIONS") {
                        VStack(spacing: 8) {
                            ForEach(idea.relatedConnections) { conn in
                                let other = conn.other(from: idea.id)
                                NavigationLink(destination: IdeaDetailView(id: other.id)) {
                                    ConnectionRow(connection: conn, ideaId: idea.id)
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
            Rectangle()
                .fill(type.color)
                .frame(width: 4)
                .clipShape(RoundedRectangle(cornerRadius: 2))

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    HStack(spacing: 4) {
                        Text(type.icon).font(.system(size: 12))
                        Text(type.label).font(.sflLabel).tracking(1)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(type.color, lineWidth: 2))
                    .foregroundStyle(type.color)

                    Spacer()

                    Text(idea.formattedDate)
                        .font(.sflMeta)
                        .foregroundStyle(Color.sflMuted)
                }

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

// MARK: - Tag Picker Sheet

struct TagPickerSheet: View {
    let existingTagIds: Set<String>
    let onAddExisting: (Idea) -> Void
    let onAddNew: (String) -> Void

    @State private var allTags: [Idea] = []
    @State private var query = ""
    @Environment(\.dismiss) private var dismiss

    private var suggestions: [Idea] {
        let pool = query.isEmpty
            ? allTags.filter { !existingTagIds.contains($0.id) }
            : allTags.filter { !existingTagIds.contains($0.id) && ($0.title ?? "").localizedCaseInsensitiveContains(query) }
        return Array(pool.prefix(20))
    }

    private var canCreate: Bool {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return false }
        return !allTags.contains { ($0.title ?? "").lowercased() == q.lowercased() }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.sflBg.ignoresSafeArea()
                List {
                    if canCreate {
                        Button {
                            onAddNew(query.trimmingCharacters(in: .whitespaces))
                            dismiss()
                        } label: {
                            Label(
                                "Create \"#\(query.trimmingCharacters(in: .whitespaces))\"",
                                systemImage: "plus.circle.fill"
                            )
                            .foregroundStyle(Color.sflAccent)
                        }
                        .listRowBackground(Color.sflSurface)
                    }
                    ForEach(suggestions) { tag in
                        Button {
                            onAddExisting(tag)
                            dismiss()
                        } label: {
                            HStack(spacing: 8) {
                                Text("🏷️").font(.system(size: 13))
                                Text(tag.title ?? "").foregroundStyle(Color.sflText)
                            }
                        }
                        .listRowBackground(Color.sflSurface)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Add Tag")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, prompt: "Search or create…")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }.foregroundStyle(Color.sflMuted)
                }
            }
        }
        .task {
            if let tags = try? await APIClient.shared.listTags() { allTags = tags }
        }
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
    let ideaId: String

    var body: some View {
        let other = connection.other(from: ideaId)
        let type = other.type.ideaType
        HStack {
            Text(type.icon).font(.system(size: 13))
            Text(other.title)
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
