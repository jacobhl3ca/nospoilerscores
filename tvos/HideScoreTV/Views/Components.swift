import SwiftUI

/// Brand surface. HideScore is a dark app on a TV by design — a bright board in
/// a dark room is the wrong thing to look at right before you start watching.
enum Brand {
    static let background = Color(red: 0.04, green: 0.05, blue: 0.07)
    static let card = Color(red: 0.11, green: 0.12, blue: 0.15)
    static let cardRaised = Color(red: 0.16, green: 0.17, blue: 0.21)
    static let hairline = Color.white.opacity(0.10)
    static let secondary = Color.white.opacity(0.62)
    static let accent = Color(red: 0.31, green: 0.80, blue: 0.51)
    static let live = Color(red: 0.94, green: 0.31, blue: 0.31)

    static func color(hex: String?) -> Color? {
        guard var hex, !hex.isEmpty else { return nil }
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let value = Int(hex, radix: 16) else { return nil }
        return Color(red: Double((value >> 16) & 0xFF) / 255,
                     green: Double((value >> 8) & 0xFF) / 255,
                     blue: Double(value & 0xFF) / 255)
    }
}

/// The type scale, sized for a couch, not a lap. tvOS's own smallest text style
/// (Caption 2) is 23pt; nothing here goes below it, because a 4K panel three
/// metres away turns anything smaller into texture.
enum Type {
    static let title: CGFloat = 46        // screen titles
    static let shelf: CGFloat = 34        // shelf headings
    static let body: CGFloat = 30         // team names, list rows
    static let detail: CGFloat = 27       // detail-card copy
    static let caption: CGFloat = 24      // status, time, channel, counts
    static let label: CGFloat = 23        // league tag, records, badges
}

/// Team mark. Falls back to the team's own colour and initials when there is no
/// logo — which is also what App Store demo mode leans on, since it strips every
/// logo URL rather than showing a trademark in a screenshot.
struct TeamMark: View {
    let team: GameTeam
    var size: CGFloat = 48

    var body: some View {
        ZStack {
            Circle().fill(Color.white.opacity(0.10))
            if let logo = team.logo, let url = URL(string: logo) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit().padding(size * 0.14)
                } placeholder: {
                    initials
                }
            } else {
                initials
            }
        }
        .frame(width: size, height: size)
    }

    private var initials: some View {
        Text(team.abbreviation.prefix(3))
            .font(.system(size: size * 0.34, weight: .bold, design: .rounded))
            .foregroundStyle(Brand.color(hex: team.color) ?? .white)
            .minimumScaleFactor(0.5)
            .lineLimit(1)
            .padding(2)
    }
}

/// The spoiler-safe verdict. It says how good the game was; it never says who
/// won or by how much — that is the whole trick of the app.
struct RatingBadge: View {
    let rating: Int
    let catalog: Catalog
    var compact = false

    var body: some View {
        let tier = catalog.tier(for: rating)
        Text(tier?.label ?? "—")
            .font(.system(size: compact ? Type.label : Type.detail, weight: .heavy, design: .rounded))
            .tracking(0.5)
            .foregroundStyle(.white)
            .padding(.horizontal, compact ? 14 : 18)
            .padding(.vertical, compact ? 6 : 8)
            .background(Brand.color(hex: tier?.color) ?? .gray, in: Capsule())
            .accessibilityLabel("Worth watching: \(tier?.label.capitalized ?? "unrated")")
    }
}

/// What sits where the score would be.
struct HiddenScore: View {
    var revealed: String?

    var body: some View {
        Group {
            if let revealed {
                Text(revealed).font(.system(size: Type.body, weight: .bold, design: .rounded))
            } else {
                Image(systemName: "eye.slash.fill").font(.system(size: Type.label, weight: .semibold))
            }
        }
        .foregroundStyle(revealed == nil ? Brand.secondary : .white)
        .frame(minWidth: 60)
        .accessibilityLabel(revealed ?? "Score hidden")
    }
}

struct LivePip: View {
    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(Brand.live).frame(width: 12, height: 12)
            Text("LIVE").font(.system(size: Type.label, weight: .heavy, design: .rounded)).foregroundStyle(Brand.live)
        }
    }
}

/// Shared empty/failed state so an outage never reads as "nothing on tonight".
struct StatusNote: View {
    let symbol: String
    let title: String
    var detail: String?
    var action: (() -> Void)?
    var actionTitle: String = "Try again"

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: symbol).font(.system(size: 44)).foregroundStyle(Brand.secondary)
            Text(title).font(.system(size: 32, weight: .semibold))
            if let detail {
                Text(detail).font(.system(size: Type.detail)).foregroundStyle(Brand.secondary).multilineTextAlignment(.center)
            }
            if let action {
                Button(actionTitle, action: action).padding(.top, 8)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }
}

extension Date {
    func clockTime() -> String {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f.string(from: self)
    }
}
