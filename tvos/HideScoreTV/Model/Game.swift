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
    var statusName: String       // ESPN's status.type.name — "STATUS_FINAL", "STATUS_POSTPONED"…
    var statusDetail: String     // "Final", "Top 5th", "7:10 PM"
    var completed: Bool
    var seasonType: Int?         // ESPN's season.type — 1 = preseason, 2 = regular, 3 = post
    var soccer: Bool             // decides "Away at Home" vs "Home vs Away"
    var home: GameTeam
    var away: GameTeam
    var broadcasts: [String]
    var venue: String
    var rating: Int?
    var note: String?            // "Game 4", "Conference Final"

    static func == (a: Game, b: Game) -> Bool { a.id == b.id && a.leagueKey == b.leagueKey }
    func hash(into h: inout Hasher) { h.combine(id); h.combine(leagueKey) }

    var isLive: Bool { state == "in" }

    /// Postponed, canceled and suspended games sit on ESPN's board with
    /// state "post" and nothing played. They must never read as "Final" — the
    /// website drops them outright (eventsToGames) and so does `ESPN.slate`.
    var isVoided: Bool {
        statusName.contains("POSTPONED") || statusName.contains("CANCELED") || statusName.contains("SUSPENDED")
    }

    var isFinal: Bool { (state == "post" || completed) && !isVoided }

    /// Exhibition play. Dropped unless the catalog says type 1 IS the season for
    /// this league (every rugby fixture, the NFL preseason window).
    var isPreseason: Bool { seasonType == 1 }

    /// "Away at Home" for North American sports, "Home vs Away" for soccer —
    /// the convention each sport's fans actually use.
    var matchup: String {
        soccer ? "\(home.shortName) vs \(away.shortName)" : "\(away.shortName) at \(home.shortName)"
    }

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
