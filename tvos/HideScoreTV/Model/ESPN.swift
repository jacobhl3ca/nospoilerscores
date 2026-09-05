import Foundation

/// Reads ESPN's public scoreboard the same way the website does.
///
/// HOST MATTERS — this is `site.web.api.espn.com`, not `site.api.espn.com`.
/// The website learned that the hard way in August 2026 (site.api started
/// rejecting browser-shaped requests with no CORS header and every column read
/// "Schedule unavailable"). The host is carried in the catalog rather than
/// hardcoded here, so if it moves again the fix is a website push.
enum ESPN {

    enum FetchError: Error { case badResponse, notJSON }

    static func slate(for league: Catalog.League, ymd: String, base: String) async throws -> [Game] {
        var components = URLComponents(string: base + league.path)
        var items = [URLQueryItem(name: "dates", value: ymd), URLQueryItem(name: "limit", value: "300")]
        // College football and basketball default to a top-25-only slate; group
        // 50 is "all conferences", which is what a fan actually wants on a TV.
        if league.key == "ncaaf" || league.key == "ncaam" || league.key == "ncaaw" {
            items.append(URLQueryItem(name: "groups", value: "50"))
        }
        components?.queryItems = items
        guard let url = components?.url else { throw FetchError.badResponse }

        var request = URLRequest(url: url)
        request.timeoutInterval = 15
        request.cachePolicy = .reloadRevalidatingCacheData
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw FetchError.badResponse }
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw FetchError.notJSON }

        let events = root["events"] as? [[String: Any]] ?? []
        // The same two drops as eventsToGames on the website: a postponed,
        // canceled or suspended game is not a game, and exhibition play is not
        // the season — except where the catalog says it is (every rugby
        // fixture, the NFL preseason window). `parse` itself keeps every
        // two-competitor event, which is what the parity harness compares.
        return events.compactMap { parse($0, league: league) }
            .filter { !$0.isVoided }
            .filter { !$0.isPreseason || (league.preseasonIsRegular ?? false) }
    }

    // MARK: - Parsing
    //
    // ESPN's scoreboard is loosely typed — `score` is a string on the scoreboard
    // and an object on the team-schedule endpoint, `clock` is a number or a
    // string depending on the sport. Dictionary traversal with coercing helpers
    // is what keeps one malformed field from dropping an entire slate.

    static func parse(_ event: [String: Any], league: Catalog.League) -> Game? {
        guard let id = string(event["id"]) else { return nil }
        let competitions = event["competitions"] as? [[String: Any]] ?? []
        guard let competition = competitions.first else { return nil }
        let rawCompetitors = competition["competitors"] as? [[String: Any]] ?? []
        guard rawCompetitors.count >= 2 else { return nil }

        let status = (competition["status"] as? [String: Any]) ?? (event["status"] as? [String: Any]) ?? [:]
        let type = status["type"] as? [String: Any] ?? [:]
        let state = string(type["state"]) ?? ""
        let statusName = string(type["name"]) ?? ""
        let completed = (type["completed"] as? Bool) ?? false
        let seasonType = int((event["season"] as? [String: Any])?["type"])
        let detail = string(type["shortDetail"]) ?? string(type["detail"]) ?? ""
        let period = int(status["period"]) ?? 0
        let clock = double(status["clock"])

        let home = team(rawCompetitors.first { string($0["homeAway"]) == "home" } ?? rawCompetitors[0])
        let away = team(rawCompetitors.first { string($0["homeAway"]) == "away" } ?? rawCompetitors[1])

        var broadcasts: [String] = []
        for entry in competition["broadcasts"] as? [[String: Any]] ?? [] {
            for name in entry["names"] as? [Any] ?? [] {
                if let n = string(name), !n.isEmpty, !broadcasts.contains(n) { broadcasts.append(n) }
            }
        }

        let ratingInput = Rating.Input(
            state: state,
            period: period,
            clock: clock,
            competitors: rawCompetitors.prefix(2).map { competitor($0) },
            goals: league.rating.soccer ? goals(competition) : []
        )

        return Game(
            id: id,
            leagueKey: league.key,
            leagueLabel: league.label,
            start: date(string(event["date"]) ?? string(competition["date"])),
            state: state,
            statusName: statusName,
            statusDetail: detail,
            completed: completed,
            seasonType: seasonType,
            soccer: league.rating.soccer,
            home: home,
            away: away,
            broadcasts: broadcasts,
            venue: string((competition["venue"] as? [String: Any])?["fullName"]) ?? "",
            rating: Rating.score(ratingInput, config: league.rating),
            note: string((event["season"] as? [String: Any])?["slug"]) == "post-season"
                ? string((competition["notes"] as? [[String: Any]])?.first?["headline"]) : nil
        )
    }

    private static func team(_ competitor: [String: Any]) -> GameTeam {
        let t = competitor["team"] as? [String: Any] ?? [:]
        let records = competitor["records"] as? [[String: Any]] ?? []
        let overall = records.first { string($0["type"]) == "total" } ?? records.first
        return GameTeam(
            id: string(t["id"]) ?? UUID().uuidString,
            displayName: string(t["displayName"]) ?? string(t["name"]) ?? "—",
            shortName: string(t["shortDisplayName"]) ?? string(t["name"]) ?? "—",
            abbreviation: string(t["abbreviation"]) ?? String((string(t["displayName"]) ?? "—").prefix(3)).uppercased(),
            logo: string(t["logo"]) ?? (t["logos"] as? [[String: Any]])?.first.flatMap { string($0["href"]) },
            color: string(t["color"]),
            score: int(competitor["score"]),
            isWinner: (competitor["winner"] as? Bool) ?? false,
            record: string(overall?["summary"])
        )
    }

    private static func competitor(_ raw: [String: Any]) -> Rating.Competitor {
        var lines: [Rating.LineScore] = []
        for row in raw["linescores"] as? [[String: Any]] ?? [] {
            lines.append(Rating.LineScore(
                value: double(row["value"]) ?? 0,
                runs: double(row["runs"]),
                wickets: double(row["wickets"]),
                overs: double(row["overs"]),
                isBatting: (row["isBatting"] as? Bool) ?? false
            ))
        }
        return Rating.Competitor(score: int(raw["score"]), lineScores: lines)
    }

    private static func goals(_ competition: [String: Any]) -> [Rating.Goal] {
        var out: [Rating.Goal] = []
        for play in competition["details"] as? [[String: Any]] ?? [] {
            guard (play["scoringPlay"] as? Bool) == true else { continue }
            let clockDisplay = string((play["clock"] as? [String: Any])?["displayValue"])
            guard let parsed = Rating.parseSoccerClock(clockDisplay) else { continue }
            guard let teamID = string((play["team"] as? [String: Any])?["id"]), !teamID.isEmpty else { continue }
            out.append(Rating.Goal(minute: parsed.minute, sortKey: parsed.sortKey, teamID: teamID))
        }
        return out
    }

    // MARK: - Coercion

    static func string(_ any: Any?) -> String? {
        switch any {
        case let s as String: return s
        case let n as NSNumber: return n.stringValue
        default: return nil
        }
    }

    static func int(_ any: Any?) -> Int? {
        switch any {
        case let n as NSNumber: return n.intValue
        case let s as String: return Int(s.trimmingCharacters(in: .whitespaces))
        // The team-schedule endpoint wraps the score in an object; the
        // scoreboard does not. Read both so one shape can't null out a rating.
        case let d as [String: Any]: return int(d["value"]) ?? int(d["displayValue"])
        default: return nil
        }
    }

    static func double(_ any: Any?) -> Double? {
        switch any {
        case let n as NSNumber: return n.doubleValue
        case let s as String: return Double(s)
        default: return nil
        }
    }

    private static let isoWithFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let iso = ISO8601DateFormatter()
    /// ESPN's actual shape — "2026-09-05T23:30Z", no seconds — which
    /// `ISO8601DateFormatter` refuses. Without this every start time was nil:
    /// cards said "Scheduled" instead of "7:10 PM" and shelves lost their order.
    private static let isoNoSeconds: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd'T'HH:mm'Z'"
        return f
    }()

    static func date(_ value: String?) -> Date? {
        guard let value else { return nil }
        return isoNoSeconds.date(from: value) ?? iso.date(from: value) ?? isoWithFraction.date(from: value)
    }
}
