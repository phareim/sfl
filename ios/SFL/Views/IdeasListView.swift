import SwiftUI

// MARK: - View Model

@MainActor
final class IdeasListViewModel: ObservableObject {
    @Published var ideas: [Idea] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var hasMore = true

    private var cursor: String?
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
