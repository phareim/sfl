import SwiftUI

@MainActor
final class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []
    @Published var isLoading = false
    @Published var isSending = false
    @Published var isWaitingForReply = false
    @Published var error: String?

    private var pollTimer: Timer?

    func load() {
        Task {
            isLoading = true
            await fetchMessages()
            isLoading = false
        }
    }

    func startPolling() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                await self.fetchMessages()
            }
        }
    }

    func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func fetchMessages() async {
        do {
            let resp = try await APIClient.shared.listMessages()
            // API returns newest-first; reverse for display (oldest at top)
            let fetched = resp.messages.reversed() as [Message]

            // Detect if sleeper has replied after user's last message
            if isWaitingForReply, let last = fetched.last, last.sender == "sleeper" {
                isWaitingForReply = false
            }

            messages = fetched
        } catch {
            self.error = error.localizedDescription
        }
    }

    func send(_ text: String) {
        guard !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        Task {
            isSending = true
            do {
                _ = try await APIClient.shared.sendMessage(body: text)
                isWaitingForReply = true
                await fetchMessages()
            } catch {
                self.error = error.localizedDescription
            }
            isSending = false
        }
    }
}

struct ChatView: View {
    @EnvironmentObject var settings: Settings
    @StateObject private var vm = ChatViewModel()
    @State private var inputText = ""

    var body: some View {
        NavigationStack {
            if !settings.isConfigured {
                notConfiguredView
            } else {
                chatContent
                    .navigationTitle("Chat")
                    .navigationBarTitleDisplayMode(.inline)
                    .onAppear {
                        vm.load()
                        vm.startPolling()
                    }
                    .onDisappear {
                        vm.stopPolling()
                    }
            }
        }
    }

    private var notConfiguredView: some View {
        VStack(spacing: 16) {
            Text("Not configured")
                .font(.sflHeading)
            Text("Open Settings and enter your API URL and key.")
                .font(.sflBody)
                .foregroundStyle(Color.sflMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
    }

    private var chatContent: some View {
        VStack(spacing: 0) {
            if vm.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(vm.messages) { message in
                                MessageBubble(message: message)
                                    .id(message.id)
                            }
                            if vm.isWaitingForReply {
                                thinkingBubble
                                    .id("thinking")
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                    }
                    .onChange(of: vm.messages.count) {
                        if let last = vm.messages.last {
                            withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                        }
                    }
                    .onChange(of: vm.isWaitingForReply) {
                        if vm.isWaitingForReply {
                            withAnimation { proxy.scrollTo("thinking", anchor: .bottom) }
                        }
                    }
                }
            }

            inputBar
        }
        .background(Color.sflBg)
    }

    private var thinkingBubble: some View {
        HStack {
            Text("thinking…")
                .font(.sflBody)
                .foregroundStyle(Color.sflMuted)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(Color.sflSurface)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            Spacer()
        }
    }

    private var inputBar: some View {
        HStack(spacing: 8) {
            TextField("Message Sleeper…", text: $inputText, axis: .vertical)
                .lineLimit(1...5)
                .font(.sflBody)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color.sflSurface)
                .clipShape(RoundedRectangle(cornerRadius: 16))

            Button {
                let text = inputText.trimmingCharacters(in: .whitespaces)
                guard !text.isEmpty else { return }
                inputText = ""
                vm.send(text)
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(inputText.trimmingCharacters(in: .whitespaces).isEmpty ? Color.sflMuted : Color.sflAccent)
            }
            .disabled(inputText.trimmingCharacters(in: .whitespaces).isEmpty || vm.isSending)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.sflBg)
    }
}

struct MessageBubble: View {
    let message: Message

    var isUser: Bool { message.sender == "user" }

    var body: some View {
        HStack {
            if isUser { Spacer(minLength: 48) }
            Text(message.body)
                .font(.sflBody)
                .foregroundStyle(isUser ? Color.sflInk : Color.sflText)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(isUser ? Color.sflAccent : Color.sflSurface)
                .clipShape(RoundedRectangle(cornerRadius: 16))
            if !isUser { Spacer(minLength: 48) }
        }
    }
}
