import Foundation

/// Anonymizes the board for App Store screenshots.
///
/// HideScore was rejected twice under Guideline 4.1(a) (Copycats) because the
/// submitted screenshots showed real team marks and league names — Apple counts
/// screenshots as metadata. The website solved it with a `?demo=1` transformer;
/// this is the same idea for tvOS, behind a launch argument so no shipped build
/// can reach it by accident:
///
///     xcrun simctl launch booted com.jacobhl.hidescore -HSDemoMode YES
///
/// The catalog is anonymized first, so every league label the app renders —
/// board headings, card headers, the Leagues picker — is already a placeholder
/// by the time a view sees it. Only team names, broadcasters and venues are left
/// for the slate pass.
enum DemoMode {
    static let isActive = UserDefaults.standard.bool(forKey: "HSDemoMode")

    /// Which tab to open on, so each App Store screenshot is one deterministic
    /// launch instead of a script pretending to be a remote control:
    ///
    ///     -HSDemoMode YES -HSDemoTab worth
    ///
    /// `-HSDemoDetail YES` opens the top game's detail card, and
    /// `-HSDemoReveal YES` opens it with the score already revealed.
    static var initialTab: Int {
        guard isActive else { return 0 }
        switch UserDefaults.standard.string(forKey: "HSDemoTab") {
        case "worth": return 1
        case "leagues": return 2
        case "settings": return 3
        default: return 0
        }
    }

    static var opensDetail: Bool { isActive && UserDefaults.standard.bool(forKey: "HSDemoDetail") }
    static var revealsDetail: Bool { isActive && UserDefaults.standard.bool(forKey: "HSDemoReveal") }

    /// Deterministic placeholder for a league's position in the catalog, so the
    /// same league is "Sports C" on every screen and across relaunches.
    private static func slot(_ index: Int) -> String {
        index < 26 ? String(UnicodeScalar(65 + index)!) : "\(index + 1)"
    }

    static func apply(_ catalog: Catalog) -> Catalog {
        guard isActive else { return catalog }
        let leagues = catalog.leagues.enumerated().map { index, league in
            Catalog.League(key: league.key, label: "Sports \(slot(index))", path: league.path,
                           logo: nil, defaultOn: league.defaultOn,
                           season: league.season, rating: league.rating,
                           preseasonIsRegular: league.preseasonIsRegular)
        }
        return Catalog(schema: catalog.schema, espnBase: catalog.espnBase,
                       ratingTiers: catalog.ratingTiers, leagues: leagues)
    }

    /// One game re-anonymized inside its slate, for a detail card that re-reads
    /// the live copy of a game the demo board already renamed.
    static func apply(_ game: Game, in slate: LeagueSlate) -> Game {
        guard isActive else { return game }
        return apply([slate]).first?.games.first { $0.id == game.id } ?? game
    }

    static func apply(_ slates: [LeagueSlate]) -> [LeagueSlate] {
        guard isActive else { return slates }
        return slates.map { slate in
            // Number teams by first appearance so a team keeps its placeholder
            // across every card in the shelf.
            var numbers: [String: Int] = [:]
            let letter = slate.league.label.split(separator: " ").last.map(String.init) ?? "A"
            func rename(_ team: GameTeam) -> GameTeam {
                var team = team
                let n = numbers[team.id] ?? (numbers.count + 1)
                numbers[team.id] = n
                team.displayName = "Team \(letter)\(n)"
                team.shortName = "Team \(letter)\(n)"
                team.abbreviation = "\(letter)\(n)"
                team.logo = nil
                team.record = nil
                return team
            }
            let games = slate.games.map { game -> Game in
                var game = game
                game.away = rename(game.away)
                game.home = rename(game.home)
                game.broadcasts = game.broadcasts.isEmpty ? [] : ["Stream"]
                game.venue = ""
                game.note = nil
                return game
            }
            return LeagueSlate(league: slate.league, games: games, failed: slate.failed)
        }
    }
}
