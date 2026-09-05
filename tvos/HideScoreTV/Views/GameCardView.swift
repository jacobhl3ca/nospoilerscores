import SwiftUI

/// One game on a shelf. Nothing on the face of it gives the result away: the
/// scores are replaced by a hidden marker, and the only quality signal is the
/// worth-watching badge, which is spoiler-safe by construction.
struct GameCardView: View {
    let game: Game
    let catalog: Catalog
    let showRatings: Bool
    let revealScores: Bool
    let onSelect: () -> Void

    /// Three cards and a fourth peeking, on a 1920-wide board with 70pt margins.
    static let size = CGSize(width: 520, height: 304)

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 0) {
                header
                Divider().overlay(Brand.hairline).padding(.vertical, 16)
                teamRow(game.away)
                Spacer(minLength: 10)
                teamRow(game.home)
                Spacer(minLength: 0)
                footer
            }
            .padding(24)
            .frame(width: Self.size.width, height: Self.size.height, alignment: .topLeading)
        }
        .buttonStyle(.card)
        .accessibilityLabel(accessibilityText)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(game.leagueLabel.uppercased())
                .font(.system(size: Type.label, weight: .heavy, design: .rounded))
                .tracking(1.1)
                .foregroundStyle(Brand.secondary)
            Spacer()
            if game.isLive {
                HStack(spacing: 12) {
                    LivePip()
                    // Safe to show while a game is in progress — a period or an
                    // inning says how far along it is, not who is winning. It is
                    // suppressed on finals on purpose: ESPN writes "Final/10"
                    // there, which leaks that the game went long.
                    if !game.statusDetail.isEmpty {
                        Text(game.statusDetail)
                            .font(.system(size: Type.caption, weight: .medium))
                            .foregroundStyle(Brand.secondary)
                            .lineLimit(1)
                    }
                }
            } else {
                Text(headerRight)
                    .font(.system(size: Type.caption, weight: .semibold))
                    .foregroundStyle(Brand.secondary)
            }
        }
    }

    /// A scheduled game shows its start time; a finished one says "Final" and
    /// nothing more. `statusDetail` is deliberately NOT used for finals — ESPN
    /// writes "Final/10" for extra innings, which leaks that the game went long.
    private var headerRight: String {
        if game.isFinal { return "Final" }
        if let start = game.start { return start.clockTime() }
        return game.statusDetail
    }

    private func teamRow(_ team: GameTeam) -> some View {
        HStack(spacing: 16) {
            TeamMark(team: team)
            VStack(alignment: .leading, spacing: 2) {
                Text(team.shortName)
                    .font(.system(size: Type.body, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                // A record is hidden once the game is over — it has already
                // absorbed the result.
                if let record = team.record, !record.isEmpty, !game.isFinal {
                    Text(record).font(.system(size: Type.label)).foregroundStyle(Brand.secondary).lineLimit(1)
                }
            }
            // Greedy frame rather than a Spacer, so both rows on a card are
            // proposed the same width and a long name shrinks by the same step
            // on each. Cards are narrow, so here the name really can need it.
            .frame(maxWidth: .infinity, alignment: .leading)
            if game.state == "pre" {
                EmptyView()
            } else {
                HiddenScore(revealed: revealScores ? team.score.map(String.init) : nil)
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 12) {
            if showRatings, game.isFinal || game.isLive, let rating = game.rating {
                RatingBadge(rating: rating, catalog: catalog, compact: true)
            } else if game.isLive {
                Text("Too early to rate").font(.system(size: Type.label)).foregroundStyle(Brand.secondary)
            }
            Spacer()
            if let broadcast = game.broadcasts.first {
                Text(broadcast)
                    .font(.system(size: Type.label, weight: .medium))
                    .foregroundStyle(Brand.secondary)
                    .lineLimit(1)
            }
        }
        .frame(height: 44)
    }

    /// Siri and VoiceOver must not narrate the score either.
    private var accessibilityText: String {
        var parts = ["\(game.leagueLabel). \(game.away.displayName) versus \(game.home.displayName)"]
        parts.append(game.isFinal ? "Final, score hidden" : (game.isLive ? "Live now" : (game.start?.clockTime() ?? "")))
        if showRatings, let rating = game.rating, let tier = catalog.tier(for: rating) {
            parts.append("Worth watching: \(tier.label.capitalized)")
        }
        return parts.joined(separator: ". ")
    }
}
