import AppKit
import SwiftUI

final class CapturePanel: NSPanel {
    private let context: CaptureContext
    private let onDismiss: () -> Void

    init(context: CaptureContext, onDismiss: @escaping () -> Void) {
        self.context = context
        self.onDismiss = onDismiss

        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 540),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )

        isFloatingPanel = true
        level = .floating
        titlebarAppearsTransparent = true
        titleVisibility = .hidden
        isMovableByWindowBackground = true
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true

        let view = CaptureView(context: context) { [weak self] in
            self?.dismiss()
        }
        contentView = NSHostingView(rootView: view)
    }

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    func show() {
        let screen = NSScreen.screens.first {
            NSMouseInRect(NSEvent.mouseLocation, $0.frame, false)
        } ?? NSScreen.main

        if let sf = screen?.visibleFrame {
            setFrameOrigin(NSPoint(
                x: sf.midX - frame.width / 2,
                y: sf.midY - frame.height / 2
            ))
        }

        makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func dismiss() {
        close()
        onDismiss()
    }

    override func cancelOperation(_ sender: Any?) {
        dismiss()
    }
}
