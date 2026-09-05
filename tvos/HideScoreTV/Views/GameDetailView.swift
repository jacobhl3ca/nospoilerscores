import SwiftUI

/// The full card, opened with Select. Still hidden — revealing is a separate,
/// deliberate press, because the whole point is that you can look at a game
/// without being told how it ended.
struct GameDetailView: View {
    let game: Game
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var revealed = DemoMode.revealsDetail

    var body: some View {
        // Re-read on every render so a live game's inning and rating keep
        // moving with the board's auto-refresh instead of freezing at the
        // moment the card was opened.
        let game = model.current(game)
        let catalog = model.catalog
        ZStack {
            Brand.background.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 28) {
                header(game)
                VStack(spacing: 20) {
                    teamRow(game.away, in: game)
                    teamRow(game.home, in: game)
                }
                if let rating = game.rating {
                    verdict(rating, catalog: catalog)
                }
                details(game)
                Spacer(minLength: 0)
                controls(game)
            }
            .padding(.horizontal, 90)
            .padding(.vertical, 60)
        }
        // Without this the Menu button falls through the cover to the system and
        // drops the viewer on the Home screen instead of back to the board.
        .onExitCommand { dismiss() }
    }

    private func header(_ game: Game) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 18) {
            Text(game.leagueLabel.uppercased())
                .font(.system(size: 26, weight: .heavy, design: .rounded))
                .tracking(1.2)
                .foregroundStyle(Brand.secondary)
            Spacer()
            if game.isLive {
                HStack(spacing: 14) {
                    LivePip()
                    if !game.statusDetail.isEmpty {
                        Text(game.statusDetail)
                            .font(.system(size: 26, weight: .semibold))
                            .foregroundStyle(Brand.secondary)
                    }
                }
            } else {
                Text(game.isFinal ? "Final" : (game.start?.clockTime() ?? game.statusDetail))
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(Brand.secondary)
            }
        }
    }

    private func teamRow(_ team: GameTeam, in game: Game) -> some View {
        HStack(spacing: 22) {
            TeamMark(team: team, size: 72)
            VStack(alignment: .leading, spacing: 4) {
                // No minimumScaleFactor. A detail row is ~1,100pt wide, so a name
                // never needs to shrink — and when it was allowed to, SwiftUI
                // scaled the two rows by different amounts and the home team
                // rendered a visible size smaller than the away team.
                Text(team.displayName).font(.system(size: 40, weight: .semibold)).lineLimit(1)
                // Same rule as the card: a record after the final has already
                // absorbed the result, so it stays off finished games.
                if let record = team.record, !record.isEmpty, !game.isFinal {
                    Text(record).font(.system(size: Type.label)).foregroundStyle(Brand.secondary).lineLimit(1)
                }
            }
            // A greedy leading frame instead of a trailing Spacer, so both rows
            // are proposed the same width no matter what sits to their right.
            .frame(maxWidth: .infinity, alignment: .leading)
            if game.state != "pre" {
                Text(revealed ? (team.score.map(String.init) ?? "—") : "•••")
                    .font(.system(size: 48, weight: .heavy, design: .rounded))
                    .foregroundStyle(revealed ? .white : Brand.secondary)
                    .contentTransition(.opacity)
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 18)
        .background(Brand.card, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func verdict(_ rating: Int, catalog: Catalog) -> some View {
        HStack(spacing: 18) {
            RatingBadge(rating: rating, catalog: catalog)
            Text(verdictCopy(rating, catalog: catalog))
                .font(.system(size: Type.detail))
                .foregroundStyle(Brand.secondary)
            Spacer()
        }
    }

    /// Describes the rating without describing the game.
    private func verdictCopy(_ rating: Int, catalog: Catalog) -> String {
        switch catalog.tier(for: rating)?.label {
        case "GREAT": return "Close the whole way. Worth your time."
        case "GOOD":  return "Competitive. A solid watch."
        case "MEH":   return "It got away from someone."
        case "SKIP":  return "One-sided. Save the two hours."
        default:      return "Not enough of the game has been played to judge."
        }
    }

    private func details(_ game: Game) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if !game.broadcasts.isEmpty {
                detailRow("tv", game.broadcasts.joined(separator: ", "))
            }
            if !game.venue.isEmpty {
                detailRow("mappin.and.ellipse", game.venue)
            }
            if let note = game.note, !note.isEmpty {
                detailRow("trophy", note)
            }
            if let start = game.start {
                detailRow("clock", start.formatted(date: .abbreviated, time: .shortened))
            }
        }
    }

    private func detailRow(_ symbol: String, _ text: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: symbol).frame(width: 34).foregroundStyle(Brand.secondary)
            Text(text).font(.system(size: Type.detail)).foregroundStyle(Brand.secondary).lineLimit(2)
        }
    }

    private func controls(_ game: Game) -> some View {
        HStack(spacing: 28) {
            if game.state != "pre" {
                Button {
                    withAnimation(.easeInOut(duration: 0.18)) { revealed.toggle() }
                } label: {
                    Label(revealed ? "Hide score" : "Show score",
                          systemImage: revealed ? "eye.slash" : "eye")
                }
            }
            Button("Done") { dismiss() }
        }
    }
}
