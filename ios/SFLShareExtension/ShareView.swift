import SwiftUI

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

    @State private var title = ""
    @State private var selectedType = "page"
    @State private var isSaving = false
    @State private var error: String?
    @State private var didSave = false

    private var availableTypes: [IdeaType] {
        context.url != nil
            ? [.page, .tweet, .video, .quote, .note]
            : [.note, .quote, .text]
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
            selectedType = context.url != nil ? "page" : "note"
        }
        .onChange(of: context.suggestedTitle) { _, t in
            if title.isEmpty { title = t }
        }
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

    // MARK: - Save

    private func save() async {
        isSaving = true
        error = nil
        do {
            let urlString = context.url?.absoluteString
            let textContent = context.text
            let t = title.isEmpty ? (urlString ?? textContent ?? "") : title

            try await APIClient.shared.createIdea(
                type: selectedType,
                title: t.isEmpty ? nil : t,
                url: urlString,
                summary: selectedType == "note" ? textContent : nil
            )
            didSave = true
            try? await Task.sleep(for: .milliseconds(600))
            onComplete()
        } catch {
            self.error = error.localizedDescription
            isSaving = false
        }
    }
}
