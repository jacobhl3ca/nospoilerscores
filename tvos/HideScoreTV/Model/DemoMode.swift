import Foundation

/// Anonymizes the board for App Store screenshots.
///
/// HideScore was rejected twice under Guideline 4.1(a) (Copycats) because the
/// submitted screenshots showed real team logos and league names, and Apple
/// counts screenshots as metadata. The website solved it with a `?demo=1`
/// transformer; this is the same idea for tvOS, switched on with a launch
/// argument so no shipped build can reach it by accident:
///
///     xcrun simctl launch --console booted com.jacobhl.hidescore -HSDemoMode YES
///
/// It swaps every trademarked string for a placeholder and drops the logo URLs,
/// which makes the cards fall back to their initial-circle rendering.
enum DemoMode {
    static let isActive = UserDefaults.standard.bool(forKey: "HSDemoMode")

    private static let leagueLabels = ["Sports A", "Sports B", "Sports C", "Sports D", "Sports E"]

    static func apply(_ slates: [LeagueSlate]) -> [LeagueSlate] {
        guard isActive else { return slates }
        return slates.enumerated().map { index, slate in
            let label = index < leagueLabels.count ? leagueLabels[index] : "Sports \(index + 1)"
            let slot = String(UnicodeScalar(65 + min(index, 25))!)
            var numbers: [String: Int] = [:]
            var next = 1
            func rename(_ team: GameTeam) -> GameTeam {
                var team = team
                let n: Int
                if let existing = numbers[team.id] { n = existing } else { n = next; numbers[team.id] = n; next += 1 }
                team.displayName = "Team \(slot)\(n)"
                team.shortName = "Team \(slot)\(n)"
                team.abbreviation = "\(slot)\(n)"
                team.logo = nil
                team.record = nil
                return team
            }
            var games = slate.games.map { game -> Game in
                var game = game
                game.leagueLabel = label
                game.home = rename(game.home)
                game.away = rename(game.away)
                game.broadcasts = game.broadcasts.isEmpty ? [] : ["Stream"]
                game.venue = ""
                game.note = nil
                return game
            }
            games.sort { ($0.rating ?? -1) > ($1.rating ?? -1) }
            var league = slate.league
            league = Catalog.League(key: league.key, label: label, path: league.path, logo: nil,
                                    defaultOn: league.defaultOn, season: league.season, rating: league.rating)
            return LeagueSlate(league: league, games: games, failed: slate.failed)
        }
    }
}
