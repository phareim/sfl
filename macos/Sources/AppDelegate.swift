import AppKit
import SwiftUI

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let hotkeyManager = HotkeyManager()
    private var capturePanel: CapturePanel?
    private var settingsWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupStatusItem()
        registerHotkey()
        checkAccessibility()

        if !Settings.shared.isConfigured {
            openSettings()
        }
    }

    // MARK: - Menu bar

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "lightbulb.fill", accessibilityDescription: "SFL")
            button.image?.isTemplate = true
        }

        let menu = NSMenu()
        menu.addItem(withTitle: "Capture Idea  ⌃⌥I", action: #selector(triggerCapture), keyEquivalent: "")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Settings…", action: #selector(openSettings), keyEquivalent: ",")
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit SFL Capture", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        for item in menu.items { item.target = self }
        statusItem.menu = menu
    }

    // MARK: - Hotkey

    private func registerHotkey() {
        hotkeyManager.register { [weak self] in
            self?.triggerCapture()
        }
    }

    private func checkAccessibility() {
        if !AXIsProcessTrusted() {
            let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
            AXIsProcessTrustedWithOptions(opts)
        }
    }

    // MARK: - Capture

    @objc func triggerCapture() {
        capturePanel?.close()
        capturePanel = nil

        Task { @MainActor in
            let content = await TextGrabber.capture()
            let context = CaptureContext(content: content)
            let panel = CapturePanel(context: context) { [weak self] in
                self?.capturePanel = nil
            }
            panel.show()
            self.capturePanel = panel
        }
    }

    // MARK: - Settings

    @objc func openSettings() {
        if let window = settingsWindow, window.isVisible {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 400, height: 300),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "SFL Capture — Settings"
        window.contentView = NSHostingView(rootView: SettingsView())
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        settingsWindow = window
    }
}
