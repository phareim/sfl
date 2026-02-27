import AppKit
import ApplicationServices

struct CapturedContent {
    var selectedText: String?
    var sourceApp: String?
    var windowTitle: String?
    var browserURL: String?
}

enum TextGrabber {

    static func capture() async -> CapturedContent {
        var content = CapturedContent()

        guard let app = NSWorkspace.shared.frontmostApplication else { return content }
        content.sourceApp = app.localizedName
        content.windowTitle = windowTitle(pid: app.processIdentifier)

        if let bundleId = app.bundleIdentifier {
            content.browserURL = browserURL(bundleId: bundleId)
        }

        content.selectedText = selectedTextViaAccessibility()
            ?? selectedTextViaPasteboard()

        return content
    }

    // MARK: - Window title via Accessibility

    private static func windowTitle(pid: pid_t) -> String? {
        let appEl = AXUIElementCreateApplication(pid)
        var window: AnyObject?
        guard AXUIElementCopyAttributeValue(appEl, kAXFocusedWindowAttribute as CFString, &window) == .success else {
            return nil
        }
        var title: AnyObject?
        AXUIElementCopyAttributeValue(window as! AXUIElement, kAXTitleAttribute as CFString, &title)
        return title as? String
    }

    // MARK: - Selected text (Accessibility — clean, no clipboard impact)

    private static func selectedTextViaAccessibility() -> String? {
        let system = AXUIElementCreateSystemWide()
        var focused: AnyObject?
        guard AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute as CFString, &focused) == .success else {
            return nil
        }
        var value: AnyObject?
        AXUIElementCopyAttributeValue(focused as! AXUIElement, kAXSelectedTextAttribute as CFString, &value)
        let text = value as? String
        return (text?.isEmpty == false) ? text : nil
    }

    // MARK: - Selected text fallback (simulate ⌘C, read pasteboard)

    private static func selectedTextViaPasteboard() -> String? {
        let pb = NSPasteboard.general
        let before = pb.changeCount

        let src = CGEventSource(stateID: CGEventSourceStateID.hidSystemState)
        let cDown = CGEvent(keyboardEventSource: src, virtualKey: 0x08, keyDown: true)
        let cUp   = CGEvent(keyboardEventSource: src, virtualKey: 0x08, keyDown: false)
        cDown?.flags = CGEventFlags.maskCommand
        cUp?.flags   = CGEventFlags.maskCommand
        cDown?.post(tap: CGEventTapLocation.cghidEventTap)
        cUp?.post(tap: CGEventTapLocation.cghidEventTap)

        Thread.sleep(forTimeInterval: 0.1)

        guard pb.changeCount != before else { return nil }
        return pb.string(forType: .string)
    }

    // MARK: - Browser URL via AppleScript

    private static let browserScripts: [String: String] = [
        "com.apple.Safari":
            "tell application \"Safari\" to return URL of current tab of front window",
        "com.google.Chrome":
            "tell application \"Google Chrome\" to return URL of active tab of front window",
        "company.thebrowser.Browser":
            "tell application \"Arc\" to return URL of active tab of front window",
        "com.brave.Browser":
            "tell application \"Brave Browser\" to return URL of active tab of front window",
        "com.microsoft.edgemac":
            "tell application \"Microsoft Edge\" to return URL of active tab of front window",
        "com.vivaldi.Vivaldi":
            "tell application \"Vivaldi\" to return URL of active tab of front window",
    ]

    private static func browserURL(bundleId: String) -> String? {
        guard let source = browserScripts[bundleId] else { return nil }
        var error: NSDictionary?
        let result = NSAppleScript(source: source)?.executeAndReturnError(&error)
        return result?.stringValue
    }
}
