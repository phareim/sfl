import SwiftUI

// MARK: - Local copies of shared UI components (not in extension target)

private struct TypeChip: View {
    let type: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(type.ideaType.icon).font(.system(size: 12))
                Text(type.ideaType.label).font(.sflLabel).tracking(0.5)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(selected ? Color.sflAccent : Color.sflSurface)
            .foregroundStyle(selected ? Color.sflInk : Color.sflMuted)
            .overlay(RoundedRectangle(cornerRadius: 4)
                .strokeBorder(selected ? Color.clear : Color.sflStroke, lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .buttonStyle(.plain)
    }
}

private struct SFLField: View {
    let label: String
    let placeholder: String
    @Binding var text: String
    var secure: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.sflLabel).tracking(1).foregroundStyle(Color.sflMuted)
            Group {
                if secure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
            }
            .font(.sflBody)
            .padding(12)
            .background(Color.sflSurface)
            .foregroundStyle(Color.sflText)
            .overlay(RoundedRectangle(cornerRadius: 4)
                .strokeBorder(Color.sflStroke, lineWidth: 2))
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
    }
}

// MARK: - Tag Flow Layout

private struct TagFlow: Layout {
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

// MARK: - Share Context (passed from ViewController to SwiftUI)

@MainActor
final class ShareContext: ObservableObject {
    @Published var url: URL?
    @Published var text: String?
    @Published var suggestedTitle: String = ""
    @Published var isLoading = true
}

// MARK: - Share View

struct ShareView: View {
    @ObservedObject var context: ShareContext
    let onComplete: () -> Void
    let onCancel: () -> Void

    private struct TagItem: Identifiable, Equatable {
        let id: String
        let name: String
        let isNew: Bool
        init(existing idea: Idea) { id = idea.id; name = idea.title ?? ""; isNew = false }
        init(newName: String) { id = UUID().uuidString; name = newName; isNew = true }
    }

    @State private var title = ""
    @State private var selectedType = "page"
    @State private var isSaving = false
    @State private var error: String?
    @State private var didSave = false

    @State private var metaPriority = "B"
    @State private var metaStatus = "draft"

    @State private var allTags: [Idea] = []
    @State private var selectedTags: [TagItem] = []
    @State private var tagQuery = ""
    @FocusState private var tagFieldFocused: Bool

    private var tagSuggestions: [Idea] {
        let selected = Set(selectedTags.filter { !$0.isNew }.map(\.id))
        let pool = tagQuery.isEmpty
            ? allTags.filter { !selected.contains($0.id) }
            : allTags.filter { !selected.contains($0.id) && ($0.title ?? "").localizedCaseInsensitiveContains(tagQuery) }
        return Array(pool.prefix(6))
    }

    private var canCreateNewTag: Bool {
        let q = tagQuery.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return false }
        let exists = allTags.contains { ($0.title ?? "").lowercased() == q.lowercased() }
        let picked = selectedTags.contains { $0.name.lowercased() == q.lowercased() }
        return !exists && !picked
    }

    private var availableTypes: [IdeaType] {
        var types: [IdeaType] = context.url != nil
            ? [.page, .tweet, .video, .quote, .note]
            : [.note, .quote, .text]
        types.append(.meta)
        return types
    }

    var body: some View {
        ZStack {
            Color.sflBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Handle bar
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color.sflStroke)
                    .frame(width: 36, height: 4)
                    .padding(.top, 12)
                    .padding(.bottom, 20)

                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        titleBar
                        if context.isLoading {
                            loadingState
                        } else {
                            captureForm
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 32)
                }

                actionBar
            }
        }
        .onAppear {
            title = context.suggestedTitle
            selectedType = typeForURL(context.url)
        }
        .onChange(of: context.url) { _, url in
            selectedType = typeForURL(url)
        }
        .onChange(of: context.suggestedTitle) { _, t in
            if title.isEmpty { title = t }
        }
        .task {
            if let tags = try? await APIClient.shared.listTags() {
                allTags = tags
            }
        }
    }

    // MARK: - Tag helpers

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

    private func removeTag(_ tag: TagItem) {
        selectedTags.removeAll { $0.id == tag.id }
    }

    // MARK: - Sub-views

    private var titleBar: some View {
        HStack {
            Text("SFL")
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(Color.sflAccent)
            Text("Capture")
                .font(.system(size: 22, weight: .black))
                .foregroundStyle(Color.sflText)
            Spacer()
            Button("Cancel") { onCancel() }
                .font(.sflBody)
                .foregroundStyle(Color.sflMuted)
        }
    }

    private var loadingState: some View {
        HStack {
            Spacer()
            ProgressView().tint(Color.sflAccent)
            Spacer()
        }
        .padding(.vertical, 40)
    }

    private var captureForm: some View {
        VStack(alignment: .leading, spacing: 20) {
            // URL preview
            if let url = context.url {
                urlPreview(url)
            }

            // Text preview
            if let text = context.text, context.url == nil {
                textPreview(text)
            }

            // Type picker
            VStack(alignment: .leading, spacing: 8) {
                Text("TYPE")
                    .font(.sflLabel)
                    .tracking(1)
                    .foregroundStyle(Color.sflMuted)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(availableTypes, id: \.rawValue) { t in
                            TypeChip(type: t.rawValue, selected: selectedType == t.rawValue) {
                                selectedType = t.rawValue
                            }
                        }
                    }
                }
            }

            // Title field
            SFLField(label: "TITLE", placeholder: "Describe this idea…", text: $title)

            // Meta-specific fields
            if selectedType == "meta" {
                metaSection
            }

            // Tags
            tagsSection

            // Error
            if let error {
                Text(error)
                    .font(.sflSmall)
                    .foregroundStyle(.red)
            }
        }
    }

    private func urlPreview(_ url: URL) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("URL")
                .font(.sflLabel)
                .tracking(1)
                .foregroundStyle(Color.sflMuted)
            Text(url.absoluteString)
                .font(.sflSmall)
                .foregroundStyle(Color.sflText)
                .lineLimit(2)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.sflSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .strokeBorder(Color.sflStroke, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 4))
        }
    }

    private func textPreview(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("TEXT")
                .font(.sflLabel)
                .tracking(1)
                .foregroundStyle(Color.sflMuted)
            Text(text)
                .font(.sflSmall)
                .foregroundStyle(Color.sflText)
                .lineLimit(4)
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.sflSurface)
                .overlay(
                    RoundedRectangle(cornerRadius: 4)
                        .strokeBorder(Color.sflStroke, lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 4))
        }
    }

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TAGS")
                .font(.sflLabel)
                .tracking(1)
                .foregroundStyle(Color.sflMuted)

            if !selectedTags.isEmpty {
                TagFlow(spacing: 6) {
                    ForEach(selectedTags) { tag in
                        HStack(spacing: 4) {
                            Text("#\(tag.name)")
                                .font(.sflSmall)
                                .foregroundStyle(Color(hex: "#94a3b8"))
                            Button { removeTag(tag) } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(Color.sflMuted)
                            }
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

            HStack(spacing: 8) {
                Image(systemName: "tag")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.sflMuted)
                TextField("Search or add tags…", text: $tagQuery)
                    .font(.sflBody)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($tagFieldFocused)
                    .onSubmit { if canCreateNewTag { addNewTag() } }
            }
            .padding(12)
            .background(Color.sflSurface)
            .foregroundStyle(Color.sflText)
            .overlay(RoundedRectangle(cornerRadius: 4)
                .strokeBorder(
                    tagFieldFocused ? Color.sflAccent : Color.sflStroke,
                    lineWidth: tagFieldFocused ? 2 : 1
                ))
            .clipShape(RoundedRectangle(cornerRadius: 4))

            if tagFieldFocused && (!tagSuggestions.isEmpty || canCreateNewTag) {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(tagSuggestions.enumerated()), id: \.element.id) { idx, idea in
                        if idx > 0 { Divider().overlay(Color.sflStroke) }
                        Button { addExistingTag(idea) } label: {
                            HStack(spacing: 6) {
                                Text("🏷️").font(.system(size: 11))
                                Text(idea.title ?? "")
                                    .font(.sflBody)
                                    .foregroundStyle(Color.sflText)
                                Spacer()
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
                        }
                        .buttonStyle(.plain)
                    }
                    if canCreateNewTag {
                        if !tagSuggestions.isEmpty { Divider().overlay(Color.sflStroke) }
                        Button { addNewTag() } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "plus.circle.fill")
                                    .font(.system(size: 13))
                                    .foregroundStyle(Color.sflAccent)
                                Text("Create \"#\(tagQuery.trimmingCharacters(in: .whitespaces))\"")
                                    .font(.sflBody)
                                    .foregroundStyle(Color.sflText)
                                Spacer()
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 9)
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

    private var metaSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Priority
            VStack(alignment: .leading, spacing: 8) {
                Text("PRIORITY")
                    .font(.sflLabel)
                    .tracking(1)
                    .foregroundStyle(Color.sflMuted)
                HStack(spacing: 8) {
                    ForEach(["A", "B", "C", "D"], id: \.self) { p in
                        Button { metaPriority = p } label: {
                            Text(p)
                                .font(.sflLabel)
                                .tracking(1)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(metaPriority == p ? Color.sflAccent : Color.sflSurface)
                                .foregroundStyle(metaPriority == p ? Color.sflInk : Color.sflMuted)
                                .overlay(RoundedRectangle(cornerRadius: 4)
                                    .strokeBorder(metaPriority == p ? Color.clear : Color.sflStroke, lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            // Status
            VStack(alignment: .leading, spacing: 8) {
                Text("STATUS")
                    .font(.sflLabel)
                    .tracking(1)
                    .foregroundStyle(Color.sflMuted)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(["draft", "ready", "in-progress", "done", "rejected"], id: \.self) { s in
                            Button { metaStatus = s } label: {
                                Text(s.uppercased())
                                    .font(.sflLabel)
                                    .tracking(0.5)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 6)
                                    .background(metaStatus == s ? metaStatusColor(s).opacity(0.15) : Color.sflSurface)
                                    .foregroundStyle(metaStatus == s ? metaStatusColor(s) : Color.sflMuted)
                                    .overlay(RoundedRectangle(cornerRadius: 4)
                                        .strokeBorder(metaStatus == s ? metaStatusColor(s) : Color.sflStroke, lineWidth: metaStatus == s ? 2 : 1))
                                    .clipShape(RoundedRectangle(cornerRadius: 4))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func metaStatusColor(_ status: String) -> Color {
        switch status {
        case "done":        return Color(hex: "#4ade80")
        case "in-progress": return Color(hex: "#fbbf24")
        case "ready":       return Color(hex: "#60a5fa")
        case "rejected":    return Color(hex: "#f87171")
        default:            return Color.sflMuted
        }
    }

    private var actionBar: some View {
        VStack(spacing: 0) {
            Divider().overlay(Color.sflStroke)
            Button {
                guard !isSaving else { return }
                Task { await save() }
            } label: {
                HStack {
                    Spacer()
                    if isSaving {
                        ProgressView().tint(Color.sflInk)
                    } else if didSave {
                        Text("Saved ✓")
                    } else {
                        Text("Save Idea")
                    }
                    Spacer()
                }
            }
            .buttonStyle(SFLButtonStyle(variant: .primary))
            .disabled(isSaving || didSave || context.isLoading)
            .padding(16)
        }
        .background(Color.sflBg)
    }

    // MARK: - URL → type detection

    private func typeForURL(_ url: URL?) -> String {
        guard let host = url?.host?.lowercased() else { return "note" }
        switch true {
        case host.contains("x.com"), host.contains("twitter.com"),
             host.contains("threads.net"), host.contains("threads.com"),
             host.contains("bsky.app"):
            return "tweet"
        case host.contains("youtube.com"), host.contains("youtu.be"),
             host.contains("tiktok.com"), host.contains("vimeo.com"),
             host.contains("twitch.tv"):
            return "video"
        default:
            return "page"
        }
    }

    // MARK: - Save

    private func save() async {
        isSaving = true
        error = nil
        do {
            let urlString = context.url?.absoluteString
            let textContent = context.text
            let t = title.isEmpty ? (urlString ?? textContent ?? "") : title

            let metaData: [String: String?]? = selectedType == "meta" ? [
                "project": "https://github.com/phareim/sfl",
                "priority": metaPriority,
                "status": metaStatus,
                "git_commit": nil,
                "implementation_details": "",
            ] : nil

            let created = try await APIClient.shared.createIdea(
                type: selectedType,
                title: t.isEmpty ? nil : t,
                url: urlString,
                summary: selectedType == "note" ? textContent : nil,
                data: metaData
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
            try? await Task.sleep(for: .milliseconds(600))
            onComplete()
        } catch {
            self.error = error.localizedDescription
            isSaving = false
        }
    }
}
