import SwiftUI

// MARK: - View Model

@MainActor
final class IdeasListViewModel: ObservableObject {
    @Published var ideas: [Idea] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var hasMore = true

    private var cursor: Int?
    private var currentType: String = "all"
    private var currentQuery: String = ""
    private var loadTask: Task<Void, Never>?

    func load(type: String = "all", query: String = "", reset: Bool = false) {
        loadTask?.cancel()
        loadTask = Task {
            if reset {
                cursor = nil
                hasMore = true
                ideas = []
            }
            guard hasMore else { return }
            isLoading = true
            error = nil
            currentType = type
            currentQuery = query

            do {
                let result = try await APIClient.shared.listIdeas(
                    cursor: cursor,
                    type: type == "all" ? nil : type,
                    query: query.isEmpty ? nil : query
                )
                guard !Task.isCancelled else { return }
                ideas.append(contentsOf: result.ideas)
                cursor = result.cursor
                hasMore = result.cursor != nil && !query.isEmpty == false
            } catch {
                guard !Task.isCancelled else { return }
                self.error = error.localizedDescription
            }
            isLoading = false
        }
    }

    func loadMore() {
        guard !isLoading, hasMore, currentQuery.isEmpty else { return }
        load(type: currentType, query: currentQuery)
    }

    func refresh() async {
        load(type: currentType, query: currentQuery, reset: true)
    }
}

// MARK: - View

struct IdeasListView: View {
    @StateObject private var vm = IdeasListViewModel()
    @State private var searchText = ""
    @State private var selectedType = "all"
    @State private var searchDebounce: Task<Void, Never>?
    @State private var showSearch = false
    @State private var showSettings = false
    @State private var showQuickNote = false

    private let types = ["all"] + IdeaType.allCases.map(\.rawValue)

    var body: some View {
        NavigationStack {
            Group {
                if let error = vm.error {
                    errorView(error)
                } else {
                    listContent
                }
            }
            .background(Color.sflBg)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button { showQuickNote = true } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(Color.sflAccent)
                    }
                }
                ToolbarItem(placement: .principal) {
                    Image("icon")
                        .resizable()
                        .scaledToFit()
                        .frame(height: 28)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape")
                            .foregroundStyle(Color.sflMuted)
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                bottomBar
            }
            .onChange(of: searchText) { _, q in
                searchDebounce?.cancel()
                searchDebounce = Task {
                    try? await Task.sleep(for: .milliseconds(300))
                    guard !Task.isCancelled else { return }
                    await MainActor.run {
                        vm.load(type: selectedType, query: q, reset: true)
                    }
                }
            }
            .onChange(of: showSearch) { _, isShowing in
                if !isShowing {
                    searchText = ""
                    vm.load(type: selectedType, reset: true)
                }
            }
            .onChange(of: selectedType) { _, t in
                vm.load(type: t, query: searchText, reset: true)
            }
            .task { vm.load() }
            .refreshable { await vm.refresh() }
            .sheet(isPresented: $showSettings) {
                SettingsView()
            }
            .sheet(isPresented: $showQuickNote) {
                QuickNoteSheet {
                    vm.load(type: selectedType, query: searchText, reset: true)
                }
            }
        }
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
        VStack(spacing: 0) {
            if showSearch {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(Color.sflMuted)
                        .font(.system(size: 14))
                    TextField("Search ideas…", text: $searchText)
                        .font(.sflBody)
                        .foregroundStyle(Color.sflText)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    if !searchText.isEmpty {
                        Button { searchText = "" } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(Color.sflMuted)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.sflSurface)
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.sflStroke).frame(height: 1)
                }
            }

            Rectangle().fill(Color.sflStroke).frame(height: 1)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(types, id: \.self) { t in
                        TypeChip(type: t, selected: selectedType == t) {
                            selectedType = t
                        }
                    }

                    Button {
                        withAnimation(.easeInOut(duration: 0.15)) {
                            showSearch.toggle()
                        }
                    } label: {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 13, weight: .medium))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(showSearch ? Color.sflAccent : Color.sflSurface)
                            .foregroundStyle(showSearch ? Color.sflInk : Color.sflMuted)
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .strokeBorder(showSearch ? Color.clear : Color.sflStroke, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 4))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }
            .background(Color.sflBg)
        }
    }

    // MARK: - List content

    private var listContent: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                ForEach(vm.ideas) { idea in
                    NavigationLink(destination: IdeaDetailView(id: idea.id)) {
                        IdeaCardView(idea: idea)
                            .padding(.horizontal, 16)
                    }
                    .buttonStyle(.plain)
                }

                if vm.isLoading {
                    ProgressView()
                        .padding(24)
                        .tint(Color.sflAccent)
                } else if vm.hasMore {
                    Color.clear
                        .frame(height: 1)
                        .onAppear { vm.loadMore() }
                }

                if !vm.isLoading && vm.ideas.isEmpty {
                    emptyState
                }
            }
            .padding(.vertical, 16)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Text("💡")
                .font(.system(size: 48))
            Text("No ideas yet")
                .font(.sflHeading)
                .foregroundStyle(Color.sflText)
            Text("Capture ideas from the share menu")
                .font(.sflBody)
                .foregroundStyle(Color.sflMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 12) {
            Text("⚠️")
                .font(.system(size: 40))
            Text(msg)
                .font(.sflBody)
                .foregroundStyle(Color.sflMuted)
                .multilineTextAlignment(.center)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Quick Note Sheet

private struct QuickNoteSheet: View {
    let onSave: () -> Void

    private struct TagDraft: Identifiable {
        let id: String; let name: String; let isNew: Bool
        init(existing idea: Idea) { id = idea.id; name = idea.title ?? ""; isNew = false }
        init(newName: String) { id = UUID().uuidString; name = newName; isNew = true }
    }

    @State private var title = ""
    @State private var noteText = ""
    @State private var selectedTags: [TagDraft] = []
    @State private var showTagPicker = false
    @State private var isSaving = false
    @State private var error: String?
    @FocusState private var noteFocused: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color.sflBg.ignoresSafeArea()
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("TITLE")
                                .font(.sflLabel).tracking(1)
                                .foregroundStyle(Color.sflMuted)
                            TextField("Optional title…", text: $title)
                                .font(.sflBody)
                                .foregroundStyle(Color.sflText)
                                .autocorrectionDisabled()
                                .padding(12)
                                .background(Color.sflSurface)
                                .overlay(RoundedRectangle(cornerRadius: 4)
                                    .strokeBorder(Color.sflStroke, lineWidth: 1))
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("NOTE")
                                .font(.sflLabel).tracking(1)
                                .foregroundStyle(Color.sflMuted)
                            TextField("Write your note…", text: $noteText, axis: .vertical)
                                .font(.sflBody)
                                .foregroundStyle(Color.sflText)
                                .lineLimit(6...)
                                .focused($noteFocused)
                                .padding(12)
                                .background(Color.sflSurface)
                                .overlay(RoundedRectangle(cornerRadius: 4)
                                    .strokeBorder(noteFocused ? Color.sflAccent : Color.sflStroke,
                                                  lineWidth: noteFocused ? 2 : 1))
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }

                        // Tags
                        VStack(alignment: .leading, spacing: 8) {
                            Text("TAGS")
                                .font(.sflLabel).tracking(1)
                                .foregroundStyle(Color.sflMuted)
                            if !selectedTags.isEmpty {
                                FlowLayout(spacing: 6) {
                                    ForEach(selectedTags) { tag in
                                        HStack(spacing: 4) {
                                            Text("#\(tag.name)")
                                                .font(.sflSmall)
                                                .foregroundStyle(Color(hex: "#94a3b8"))
                                            Button { selectedTags.removeAll { $0.id == tag.id } } label: {
                                                Image(systemName: "xmark")
                                                    .font(.system(size: 9, weight: .bold))
                                                    .foregroundStyle(Color.sflMuted)
                                            }
                                        }
                                        .padding(.horizontal, 8).padding(.vertical, 4)
                                        .background(Color.sflSurface)
                                        .overlay(RoundedRectangle(cornerRadius: 12)
                                            .strokeBorder(Color(hex: "#94a3b8").opacity(0.4), lineWidth: 1))
                                        .clipShape(RoundedRectangle(cornerRadius: 12))
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

                        if let error {
                            Text(error).font(.sflSmall).foregroundStyle(.red)
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("New Note")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showTagPicker) {
                TagPickerSheet(
                    existingTagIds: Set(selectedTags.filter { !$0.isNew }.map(\.id)),
                    onAddExisting: { idea in
                        guard !selectedTags.contains(where: { $0.id == idea.id }) else { return }
                        selectedTags.append(TagDraft(existing: idea))
                    },
                    onAddNew: { name in
                        guard !selectedTags.contains(where: { $0.name.lowercased() == name.lowercased() }) else { return }
                        selectedTags.append(TagDraft(newName: name))
                    }
                )
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }.foregroundStyle(Color.sflMuted)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") { Task { await save() } }
                        .font(.sflBody.weight(.semibold))
                        .foregroundStyle(noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                         ? Color.sflMuted : Color.sflAccent)
                        .disabled(noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
        }
        .onAppear { noteFocused = true }
    }

    private func save() async {
        let trimmed = noteText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isSaving = true
        error = nil
        do {
            let created = try await APIClient.shared.createIdea(
                type: "note",
                title: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : title,
                url: nil,
                summary: trimmed
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
            onSave()
            dismiss()
        } catch {
            self.error = error.localizedDescription
            isSaving = false
        }
    }
}

// MARK: - Type Chip

struct TypeChip: View {
    let type: String
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if type != "all" {
                    Text(type.ideaType.icon)
                        .font(.system(size: 12))
                }
                Text(type == "all" ? "All" : type.ideaType.label)
                    .font(.sflLabel)
                    .tracking(0.5)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(selected ? Color.sflAccent : Color.sflSurface)
            .foregroundStyle(selected ? Color.sflInk : Color.sflMuted)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(selected ? Color.clear : Color.sflStroke, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 4))
        }
        .buttonStyle(.plain)
    }
}
