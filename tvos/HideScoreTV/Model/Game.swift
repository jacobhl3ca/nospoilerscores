import Foundation

struct GameTeam: Identifiable, Hashable {
    var id: String
    var displayName: String
    var shortName: String
    var abbreviation: String
    var logo: String?
    var color: String?
    var score: Int?
    var isWinner: Bool
    var record: String?
}

struct Game: Identifiable, Hashable {
    var id: String
    var leagueKey: String
    var leagueLabel: String
    var start: Date?
    var state: String            // "pre" | "in" | "post"
    var statusDetail: String     // "Final", "Top 5th", "7:10 PM"
    var completed: Bool
    var home: GameTeam
    var away: GameTeam
    var broadcasts: [String]
    var venue: String
    var rating: Int?
    var note: String?            // "Game 4", "Conference Final"

    static func == (a: Game, b: Game) -> Bool { a.id == b.id && a.leagueKey == b.leagueKey }
    func hash(into h: inout Hasher) { h.combine(id); h.combine(leagueKey) }

    var isLive: Bool { state == "in" }
    var isFinal: Bool { state == "post" || completed }

    /// Everything the score reveal is hiding, as one line.
    var revealedScore: String {
        guard let a = away.score, let h = home.score else { return "—" }
        return "\(away.abbreviation) \(a) · \(home.abbreviation) \(h)"
    }
}

struct LeagueSlate: Identifiable {
    var league: Catalog.League
    var games: [Game]
    var failed: Bool = false
    var id: String { league.key }
}
