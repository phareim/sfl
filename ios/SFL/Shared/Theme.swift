import SwiftUI

// MARK: - Adaptive Colors

extension Color {
    // Background
    static var sflBg: Color {
        Color(UIColor { t in t.userInterfaceStyle == .dark
            ? UIColor(hex: "#1c2033") : UIColor(hex: "#f4f2ee") })
    }
    static var sflSurface: Color {
        Color(UIColor { t in t.userInterfaceStyle == .dark
            ? UIColor(hex: "#252d42") : UIColor(hex: "#ffffff") })
    }
    // Text
    static var sflText: Color {
        Color(UIColor { t in t.userInterfaceStyle == .dark
            ? UIColor(hex: "#eeedf0") : UIColor(hex: "#14161e") })
    }
    static var sflMuted: Color {
        Color(UIColor { t in t.userInterfaceStyle == .dark
            ? UIColor(hex: "#8891a8") : UIColor(hex: "#7c7c8a") })
    }
    // Stroke
    static var sflStroke: Color {
        Color(UIColor { t in t.userInterfaceStyle == .dark
            ? UIColor(hex: "#3a4460") : UIColor(hex: "#14161e") })
    }
    static var sflShadow: Color {
        Color(UIColor { t in t.userInterfaceStyle == .dark
            ? UIColor(hex: "#141826") : UIColor(hex: "#14161e") })
    }
    // Accent
    static let sflAccent = Color(hex: "#c4f442")
    static let sflInk = Color(hex: "#14161e")
}

extension UIColor {
    convenience init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = CGFloat((int >> 16) & 0xFF) / 255
        let g = CGFloat((int >> 8) & 0xFF) / 255
        let b = CGFloat(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b, alpha: 1)
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8) & 0xFF) / 255
        let b = Double(int & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

// MARK: - Idea Type Colors & Icons

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

// MARK: - Hard Shadow Modifier

struct BrutalistShadow: ViewModifier {
    @Environment(\.colorScheme) var scheme
    var x: CGFloat = 3
    var y: CGFloat = 3
    var radius: CGFloat = 4

    func body(content: Content) -> some View {
        content.background(
            RoundedRectangle(cornerRadius: radius)
                .fill(Color.sflShadow)
                .offset(x: x, y: y)
        )
    }
}

extension View {
    func hardShadow(x: CGFloat = 3, y: CGFloat = 3) -> some View {
        modifier(BrutalistShadow(x: x, y: y))
    }
    func hardShadowLarge() -> some View {
        modifier(BrutalistShadow(x: 5, y: 5))
    }
}

// MARK: - Card Modifier

struct SFLCard: ViewModifier {
    var typeColor: Color = .clear
    var selected: Bool = false

    func body(content: Content) -> some View {
        content
            .background(Color.sflSurface)
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(Color.sflStroke, lineWidth: selected ? 2 : 1)
            )
            .overlay(alignment: .leading) {
                if typeColor != .clear {
                    Rectangle()
                        .fill(typeColor)
                        .frame(width: 3)
                        .clipShape(
                            .rect(topLeadingRadius: 4, bottomLeadingRadius: 4)
                        )
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .hardShadow()
    }
}

extension View {
    func sflCard(typeColor: Color = .clear) -> some View {
        modifier(SFLCard(typeColor: typeColor))
    }
}

// MARK: - Button Style

struct SFLButtonStyle: ButtonStyle {
    var variant: Variant = .primary

    enum Variant { case primary, secondary, ghost }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .bold))
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(background(configuration.isPressed))
            .foregroundStyle(foreground(configuration.isPressed))
            .overlay(
                RoundedRectangle(cornerRadius: 4)
                    .strokeBorder(borderColor, lineWidth: variant == .secondary ? 2 : 0)
            )
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.sflShadow)
                    .offset(x: configuration.isPressed ? 1 : 3,
                            y: configuration.isPressed ? 1 : 3)
            )
            .offset(x: configuration.isPressed ? 2 : 0,
                    y: configuration.isPressed ? 2 : 0)
            .animation(.easeOut(duration: 0.08), value: configuration.isPressed)
    }

    private func background(_ pressed: Bool) -> Color {
        switch variant {
        case .primary: return Color.sflAccent
        case .secondary, .ghost: return Color.sflSurface
        }
    }

    private func foreground(_ pressed: Bool) -> Color {
        switch variant {
        case .primary: return Color.sflInk
        case .secondary, .ghost: return Color.sflText
        }
    }

    private var borderColor: Color {
        switch variant {
        case .primary: return .clear
        case .secondary, .ghost: return Color.sflStroke
        }
    }
}

// MARK: - Typography Helpers

extension Font {
    static let sflTitle = Font.system(size: 32, weight: .black).width(.condensed)
    static let sflHeading = Font.system(size: 20, weight: .heavy)
    static let sflCardTitle = Font.system(size: 15, weight: .semibold)
    static let sflLabel = Font.system(size: 11, weight: .heavy)
    static let sflBody = Font.system(size: 15, weight: .regular)
    static let sflSmall = Font.system(size: 12, weight: .regular)
    static let sflMeta = Font.system(size: 11, weight: .medium)
}
