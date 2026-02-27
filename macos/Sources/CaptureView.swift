import SwiftUI

// MARK: - Capture context (holds grabbed data)

@MainActor
final class CaptureContext: ObservableObject {
    @Published var selectedText: String?
    @Published var sourceApp: String?
    @Published var windowTitle: String?
    @Published var browserURL: String?

    init(content: CapturedContent) {
        self.selectedText = content.selectedText
        self.sourceApp    = content.sourceApp
        self.windowTitle  = content.windowTitle
        self.browserURL   = content.browserURL
    }

    var suggestedTitle: String {
        if let _ = browserURL { return windowTitle ?? "" }
        if let text = selectedText { return String(text.prefix(120)).components(separatedBy: .newlines).first ?? "" }
        return windowTitle ?? ""
    }

    var autoType: String {
        if let url = browserURL {
            let l = url.lowercased()
            if l.contains("x.com") || l.contains("twitter.com") || l.contains("threads.net") || l.contains("bsky.app") { return "tweet" }
            if l.contains("youtube.com") || l.contains("youtu.be") || l.contains("tiktok.com") || l.contains("vimeo.com") { return "video" }
            return "page"
        }
        if selectedText != nil { return "quote" }
        return "note"
    }
}

// MARK: - Capture view

struct CaptureView: View {
    @ObservedObject var context: CaptureContext
    let onDismiss: () -> Void

    @State private var title = ""
    @State private var selectedType = "note"
    @State private var isSaving = false
    @State private var error: String?
    @State private var didSave = false

    // Tags
    @State private var allTags: [Idea] = []
    @State private var selectedTags: [TagItem] = []
    @State private var tagQuery = ""
    @FocusState private var titleFocused: Bool
    @FocusState private var tagFocused: Bool

    private struct TagItem: Identifiable, Equatable {
        let id: String
        let name: String
        let isNew: Bool
        init(existing idea: Idea) { id = idea.id; name = idea.title ?? ""; isNew = false }
        init(newName: String) { id = UUID().uuidString; name = newName; isNew = true }
    }

    private var tagSuggestions: [Idea] {
        let picked = Set(selectedTags.filter { !$0.isNew }.map(\.id))
        let pool = tagQuery.isEmpty
            ? allTags.filter { !picked.contains($0.id) }
            : allTags.filter { !picked.contains($0.id) && ($0.title ?? "").localizedCaseInsensitiveContains(tagQuery) }
        return Array(pool.prefix(6))
    }

    private var canCreateNewTag: Bool {
        let q = tagQuery.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return false }
        return !allTags.contains { ($0.title ?? "").lowercased() == q.lowercased() }
            && !selectedTags.contains { $0.name.lowercased() == q.lowercased() }
    }

    private var availableTypes: [IdeaType] {
        context.browserURL != nil
            ? [.page, .tweet, .video, .quote, .note]
            : [.note, .quote, .text, .page]
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(Color.sflStroke)
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    sourceInfo
                    textPreview
                    typePicker
                    titleField
                    tagsSection
                    errorMessage
                }
                .padding(20)
            }
            Divider().overlay(Color.sflStroke)
            actionBar
        }
        .frame(width: 440, height: 540)
        .background(Color.sflBg)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .onAppear {
            title = context.suggestedTitle
            selectedType = context.autoType
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { titleFocused = true }
        }
        .task { allTags = (try? await APIClient.shared.listTags()) ?? [] }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Text("SFL").font(.sflHeading).foregroundStyle(Color.sflAccent)
            Text("Capture").font(.sflHeading).foregroundStyle(Color.sflText)
            Spacer()
            if let app = context.sourceApp {
                Text(app)
                    .font(.sflSmall)
                    .foregroundStyle(Color.sflMuted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.sflSurface)
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.sflStroke, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
            Button("", systemImage: "xmark") { onDismiss() }
                .buttonStyle(SFLGhostButton())
                .font(.system(size: 12, weight: .bold))
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    // MARK: - Source info (URL)

    @ViewBuilder
    private var sourceInfo: some View {
        if let url = context.browserURL {
            VStack(alignment: .leading, spacing: 4) {
                Text("URL").font(.sflLabel).tracking(1).foregroundStyle(Color.sflMuted)
                Text(url)
                    .font(.sflSmall)
                    .foregroundStyle(Color.sflText)
                    .lineLimit(2)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.sflSurface)
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.sflStroke, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
        }
    }

    // MARK: - Captured text preview

    @ViewBuilder
    private var textPreview: some View {
        if let text = context.selectedText, !text.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("SELECTED TEXT").font(.sflLabel).tracking(1).foregroundStyle(Color.sflMuted)
                Text(text)
                    .font(.sflSmall)
                    .foregroundStyle(Color.sflText)
                    .lineLimit(5)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.sflSurface)
                    .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.sflStroke, lineWidth: 1))
                    .clipShape(RoundedRectangle(cornerRadius: 4))
            }
        }
    }

    // MARK: - Type picker

    private var typePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("TYPE").font(.sflLabel).tracking(1).foregroundStyle(Color.sflMuted)
            HStack(spacing: 6) {
                ForEach(availableTypes, id: \.rawValue) { t in
                    Button {
                        selectedType = t.rawValue
                    } label: {
                        HStack(spacing: 3) {
                            Text(t.icon).font(.system(size: 11))
                            Text(t.label).font(.sflLabel).tracking(0.5)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(selectedType == t.rawValue ? Color.sflAccent : Color.sflSurface)
                        .foregroundStyle(selectedType == t.rawValue ? Color.sflInk : Color.sflMuted)
                        .overlay(RoundedRectangle(cornerRadius: 4)
                            .strokeBorder(selectedType == t.rawValue ? Color.clear : Color.sflStroke, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Title field

    private var titleField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("TITLE").font(.sflLabel).tracking(1).foregroundStyle(Color.sflMuted)
            TextField("Describe this idea…", text: $title)
                .textFieldStyle(.plain)
                .font(.sflBody)
                .padding(10)
                .background(Color.sflSurface)
                .foregroundStyle(Color.sflText)
                .overlay(RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(titleFocused ? Color.sflAccent : Color.sflStroke, lineWidth: titleFocused ? 2 : 1))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .focused($titleFocused)
                .onSubmit { tagFocused = true }
        }
    }

    // MARK: - Tags

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("TAGS").font(.sflLabel).tracking(1).foregroundStyle(Color.sflMuted)

            if !selectedTags.isEmpty {
                WrappingHStack(spacing: 6) {
                    ForEach(selectedTags) { tag in
                        HStack(spacing: 4) {
                            Text("#\(tag.name)").font(.sflSmall).foregroundStyle(Color(hex: "#94a3b8"))
                            Button { selectedTags.removeAll { $0.id == tag.id } } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 8, weight: .bold))
                                    .foregroundStyle(Color.sflMuted)
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.sflSurface)
                        .overlay(RoundedRectangle(cornerRadius: 12)
                            .strokeBorder(Color(hex: "#94a3b8").opacity(0.4), lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
            }

            HStack(spacing: 6) {
                Image(systemName: "tag").font(.system(size: 11)).foregroundStyle(Color.sflMuted)
                TextField("Search or create tags…", text: $tagQuery)
                    .textFieldStyle(.plain)
                    .font(.sflBody)
                    .focused($tagFocused)
                    .onSubmit { if canCreateNewTag { addNewTag() } }
            }
            .padding(8)
            .background(Color.sflSurface)
            .overlay(RoundedRectangle(cornerRadius: 4)
                .strokeBorder(tagFocused ? Color.sflAccent : Color.sflStroke, lineWidth: tagFocused ? 2 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 4))

            if tagFocused && (!tagSuggestions.isEmpty || canCreateNewTag) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(tagSuggestions.enumerated()), id: \.element.id) { idx, idea in
                        if idx > 0 { Divider().overlay(Color.sflStroke) }
                        Button { addExistingTag(idea) } label: {
                            HStack(spacing: 5) {
                                Text("🏷️").font(.system(size: 10))
                                Text(idea.title ?? "").font(.sflBody).foregroundStyle(Color.sflText)
                                Spacer()
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                        }
                        .buttonStyle(.plain)
                    }
                    if canCreateNewTag {
                        if !tagSuggestions.isEmpty { Divider().overlay(Color.sflStroke) }
                        Button { addNewTag() } label: {
                            HStack(spacing: 5) {
                                Image(systemName: "plus.circle.fill").font(.system(size: 11)).foregroundStyle(Color.sflAccent)
                                Text("Create \"#\(tagQuery.trimmingCharacters(in: .whitespaces))\"")
                                    .font(.sflBody).foregroundStyle(Color.sflText)
                                Spacer()
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(Color.sflSurface)
                .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(Color.sflStroke, lineWidth: 1))
                .clipShape(RoundedRectangle(cornerRadius: 4))
            }
        }
    }

    // MARK: - Error

    @ViewBuilder
    private var errorMessage: some View {
        if let error {
            Text(error).font(.sflSmall).foregroundStyle(.red)
        }
    }

    // MARK: - Action bar

    private var actionBar: some View {
        HStack {
            Text("⌘↩ to save · esc to cancel")
                .font(.sflSmall)
                .foregroundStyle(Color.sflMuted)
            Spacer()
            Button { onDismiss() } label: { Text("Cancel") }
                .buttonStyle(SFLGhostButton())
                .keyboardShortcut(.escape, modifiers: [])
            Button {
                guard !isSaving else { return }
                Task { await save() }
            } label: {
                if isSaving {
                    ProgressView().controlSize(.small)
                } else if didSave {
                    Text("Saved ✓")
                } else {
                    Text("Save Idea")
                }
            }
            .buttonStyle(SFLPrimaryButton())
            .keyboardShortcut(.return, modifiers: .command)
            .disabled(isSaving || didSave)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
    }

    // MARK: - Actions

    private func addExistingTag(_ idea: Idea) {
        guard !selectedTags.contains(where: { $0.id == idea.id }) else { return }
        selectedTags.append(TagItem(existing: idea))
        tagQuery = ""
    }

    private func addNewTag() {
        let name = tagQuery.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty,
              !selectedTags.contains(where: { $0.name.lowercased() == name.lowercased() }) else { return }
        selectedTags.append(TagItem(newName: name))
        tagQuery = ""
    }

    private func save() async {
        isSaving = true
        error = nil
        do {
            let urlString = context.browserURL
            let textContent = context.selectedText
            let t = title.isEmpty ? (urlString ?? textContent ?? "") : title

            var data: [String: String?]? = nil
            if let text = textContent, selectedType == "quote" {
                data = ["text": text, "source": context.sourceApp]
            }
            if let text = textContent, selectedType == "note" {
                data = ["text": text]
            }

            let created = try await APIClient.shared.createIdea(
                type: selectedType,
                title: t.isEmpty ? nil : t,
                url: urlString,
                summary: selectedType == "quote" ? textContent : nil,
                data: data
            )

            for tag in selectedTags {
                let tagId: String
                if tag.isNew {
                    let newTag = try await APIClient.shared.createIdea(type: "tag", title: tag.name, url: nil)
                    tagId = newTag.id
                } else {
                    tagId = tag.id
                }
                try await APIClient.shared.createConnection(fromId: created.id, toId: tagId, label: "tagged_with")
            }

            didSave = true
            try? await Task.sleep(for: .milliseconds(500))
            onDismiss()
        } catch {
            self.error = error.localizedDescription
            isSaving = false
        }
    }
}

// MARK: - Simple wrapping HStack for tags

struct WrappingHStack: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let width = proposal.width ?? 0
        var x: CGFloat = 0; var y: CGFloat = 0; var rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > width, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += s.width + spacing; rowH = max(rowH, s.height)
        }
        return CGSize(width: width, height: y + rowH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        var x = bounds.minX; var y = bounds.minY; var rowH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; rowH = max(rowH, s.height)
        }
    }
}
