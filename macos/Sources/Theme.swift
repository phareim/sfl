import SwiftUI
import AppKit

// MARK: - Adaptive colors (light / dark)

extension NSColor {
    convenience init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = CGFloat((int >> 16) & 0xFF) / 255
        let g = CGFloat((int >> 8) & 0xFF) / 255
        let b = CGFloat(int & 0xFF) / 255
        self.init(srgbRed: r, green: g, blue: b, alpha: 1)
    }

    static func adaptive(light: String, dark: String) -> NSColor {
        NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                ? NSColor(hex: dark) : NSColor(hex: light)
        }
    }
}

extension Color {
    init(hex: String) {
        self.init(nsColor: NSColor(hex: hex))
    }

    static var sflBg:      Color { Color(nsColor: .adaptive(light: "#f4f2ee", dark: "#1c2033")) }
    static var sflSurface: Color { Color(nsColor: .adaptive(light: "#ffffff", dark: "#252d42")) }
    static var sflText:    Color { Color(nsColor: .adaptive(light: "#14161e", dark: "#eeedf0")) }
    static var sflMuted:   Color { Color(nsColor: .adaptive(light: "#7c7c8a", dark: "#8891a8")) }
    static var sflStroke:  Color { Color(nsColor: .adaptive(light: "#14161e", dark: "#3a4460")) }
    static var sflShadow:  Color { Color(nsColor: .adaptive(light: "#14161e", dark: "#141826")) }
    static let sflAccent = Color(hex: "#c4f442")
    static let sflInk    = Color(hex: "#14161e")
}

// MARK: - Idea types

enum IdeaType: String, CaseIterable {
    case page, tweet, book, quote, note, image, text, video, tag, meta

    var color: Color {
        switch self {
        case .page:  return Color(hex: "#60a5fa")
        case .tweet: return Color(hex: "#34d399")
        case .book:  return Color(hex: "#fbbf24")
        case .quote: return Color(hex: "#a78bfa")
        case .note:  return Color(hex: "#fb923c")
        case .image: return Color(hex: "#fb7185")
        case .text:  return Color(hex: "#2dd4bf")
        case .video: return Color(hex: "#f87171")
        case .tag:   return Color(hex: "#94a3b8")
        case .meta:  return Color(hex: "#818cf8")
        }
    }

    var icon: String {
        switch self {
        case .page:  return "🔗"
        case .tweet: return "🐦"
        case .book:  return "📚"
        case .quote: return "💬"
        case .note:  return "📝"
        case .image: return "🖼️"
        case .text:  return "📄"
        case .video: return "▶️"
        case .tag:   return "🏷️"
        case .meta:  return "🎯"
        }
    }

    var label: String { rawValue.uppercased() }
}

extension String {
    var ideaType: IdeaType { IdeaType(rawValue: self) ?? .note }
}

// MARK: - Typography

extension Font {
    static let sflHeading   = Font.system(size: 18, weight: .black)
    static let sflCardTitle = Font.system(size: 14, weight: .semibold)
    static let sflLabel     = Font.system(size: 11, weight: .heavy)
    static let sflBody      = Font.system(size: 13, weight: .regular)
    static let sflSmall     = Font.system(size: 11, weight: .regular)
}

// MARK: - Button styles

struct SFLPrimaryButton: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .bold))
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
            .background(Color.sflAccent)
            .foregroundStyle(Color.sflInk)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.sflShadow)
                    .offset(x: configuration.isPressed ? 1 : 3,
                            y: configuration.isPressed ? 1 : 3)
            )
            .offset(x: configuration.isPressed ? 2 : 0,
                    y: configuration.isPressed ? 2 : 0)
            .opacity(isEnabled ? 1 : 0.4)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }
}

struct SFLGhostButton: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .foregroundStyle(Color.sflMuted)
            .opacity(configuration.isPressed ? 0.6 : 1)
    }
}
