import UIKit
import SwiftUI
import UniformTypeIdentifiers

// The principal class for the Share Extension.
// Referenced from Info.plist as $(PRODUCT_MODULE_NAME).ShareViewController.
class ShareViewController: UIViewController {

    private let shareContext = ShareContext()

    override func viewDidLoad() {
        super.viewDidLoad()

        let shareView = ShareView(context: shareContext) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        } onCancel: { [weak self] in
            self?.extensionContext?.cancelRequest(
                withError: NSError(domain: "SFLShareExtension", code: NSUserCancelledError))
        }

        let host = UIHostingController(rootView: shareView)
        addChild(host)
        view.addSubview(host.view)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        host.didMove(toParent: self)

        Task { await loadSharedContent() }
    }

    // MARK: - Extract shared content

    private func loadSharedContent() async {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem else {
            await MainActor.run { shareContext.isLoading = false }
            return
        }

        var foundURL: URL?
        var foundText: String?

        for provider in item.attachments ?? [] {
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                if let result = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier),
                   let url = result as? URL {
                    foundURL = url
                }
            } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                if let result = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier),
                   let text = result as? String {
                    foundText = text
                }
            }
        }

        // Prefer item-level title over URL host
        let title = item.attributedTitle?.string
            ?? item.attributedContentText?.string

        await MainActor.run {
            shareContext.url = foundURL
            shareContext.text = foundText
            shareContext.suggestedTitle = title ?? ""
            shareContext.isLoading = false
        }
    }
}
