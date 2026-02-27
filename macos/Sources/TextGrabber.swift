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
            content.selectedText = browserSelectedText(bundleId: bundleId)
        }

        if content.selectedText == nil {
            content.selectedText = selectedTextViaAccessibility()
        }

        if content.selectedText == nil {
            content.selectedText = await selectedTextViaPasteboard()
        }

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

    // MARK: - Selected text via Accessibility (works for native apps)

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

    // MARK: - Browser URL + selected text via AppleScript / JavaScript

    private static let browserScripts: [String: (url: String, selection: String)] = [
        "com.apple.Safari": (
            url: "tell application \"Safari\" to return URL of current tab of front window",
            selection: "tell application \"Safari\" to do JavaScript \"window.getSelection().toString()\" in current tab of front window"
        ),
        "com.google.Chrome": (
            url: "tell application \"Google Chrome\" to return URL of active tab of front window",
            selection: "tell application \"Google Chrome\" to execute active tab of front window javascript \"window.getSelection().toString()\""
        ),
        "company.thebrowser.Browser": (
            url: "tell application \"Arc\" to return URL of active tab of front window",
            selection: "tell application \"Arc\" to execute active tab of front window javascript \"window.getSelection().toString()\""
        ),
        "com.brave.Browser": (
            url: "tell application \"Brave Browser\" to return URL of active tab of front window",
            selection: "tell application \"Brave Browser\" to execute active tab of front window javascript \"window.getSelection().toString()\""
        ),
        "com.microsoft.edgemac": (
            url: "tell application \"Microsoft Edge\" to return URL of active tab of front window",
            selection: "tell application \"Microsoft Edge\" to execute active tab of front window javascript \"window.getSelection().toString()\""
        ),
        "com.vivaldi.Vivaldi": (
            url: "tell application \"Vivaldi\" to return URL of active tab of front window",
            selection: "tell application \"Vivaldi\" to execute active tab of front window javascript \"window.getSelection().toString()\""
        ),
    ]

    private static func browserURL(bundleId: String) -> String? {
        guard let source = browserScripts[bundleId]?.url else { return nil }
        var error: NSDictionary?
        let result = NSAppleScript(source: source)?.executeAndReturnError(&error)
        return result?.stringValue
    }

    private static func browserSelectedText(bundleId: String) -> String? {
        guard let source = browserScripts[bundleId]?.selection else { return nil }
        var error: NSDictionary?
        let result = NSAppleScript(source: source)?.executeAndReturnError(&error)
        guard error == nil, let text = result?.stringValue, !text.isEmpty else { return nil }
        return text
    }

    // MARK: - Selected text fallback: System Events ⌘C → pasteboard

    private static func selectedTextViaPasteboard() async -> String? {
        let pb = NSPasteboard.general
        let before = pb.changeCount

        let script = NSAppleScript(source: "tell application \"System Events\" to keystroke \"c\" using {command down}")
        script?.executeAndReturnError(nil)

        for _ in 0..<10 {
            try? await Task.sleep(for: .milliseconds(50))
            if pb.changeCount != before {
                return pb.string(forType: .string)
            }
        }
        return nil
    }
}
