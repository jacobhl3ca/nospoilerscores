import Foundation

/// What the Top Shelf shows: two rows, nothing else.
///
/// Built from the same catalog, the same ESPN parser and the same rating as
/// the app, so the shelf and the board never disagree about which games
/// deserve the evening. No score ever reaches a tile — the whole shelf is
/// visible on the Home screen before anyone has chosen to look.
struct Shelf {
    struct Entry: Identifiable {
        let game: Game
        /// The service day the game was fetched under — the deep link needs it
        /// so the app can load the same board the shelf was built from.
        let day: Date
        var id: String { "\(game.leagueKey)-\(game.id)" }

        /// `hidescore://game?league=mlb&id=401…&day=20260904`, opened by the app
        /// straight onto the game's card.
        var deepLink: URL {
            var c = URLComponents()
            c.scheme = "hidescore"
            c.host = "game"
            c.queryItems = [URLQueryItem(name: "league", value: game.leagueKey),
                            URLQueryItem(name: "id", value: game.id),
                            URLQueryItem(name: "day", value: ServiceDay.ymd(day))]
            return c.url!
        }
    }

    struct Section {
        let title: String
        let entries: [Entry]
    }

    var sections: [Section]
    var isEmpty: Bool { sections.allSatisfy { $0.entries.isEmpty } }
}

enum ShelfBuilder {
    /// Enough to fill the row with a couple of pages, not so many that the
    /// extension spends its time budget rendering games nobody scrolls to.
    static let maxItems = 10

    /// Worth watching = GOOD and up. A SKIP on the Home screen tells you
    /// nothing you'd act on; the threshold is the catalog's, not a constant.
    static func goodThreshold(_ catalog: Catalog) -> Int {
        catalog.ratingTiers.first { $0.label == "GOOD" }?.min ?? 70
    }

    /// Fetches today and yesterday for every followed league in season, and
    /// splits the result into "worth watching" (finished, rated GOOD+) and
    /// "on tonight" (today's live and upcoming games).
    static func build(catalog: Catalog,
                      isFollowed: (Catalog.League) -> Bool,
                      now: Date = Date(),
                      timeout: TimeInterval = 6) async -> Shelf {
        let today = ServiceDay.today(now)
        let yesterday = ServiceDay.offset(-1, from: today)
        let base = catalog.espnBase

        var jobs: [(Catalog.League, Date)] = []
        for league in catalog.leagues where isFollowed(league) {
            for day in [today, yesterday] where league.inSeason(on: day) { jobs.append((league, day)) }
        }

        let fetched = await withTaskGroup(of: (Date, [Game]).self) { group -> [(Date, [Game])] in
            for (league, day) in jobs {
                group.addTask {
                    let ymd = ServiceDay.ymd(day)
                    let games = (try? await withTimeout(timeout) {
                        try await ESPN.slate(for: league, ymd: ymd, base: base)
                    }) ?? []
                    return (day, games)
                }
            }
            var out: [(Date, [Game])] = []
            for await result in group { out.append(result) }
            return out
        }

        let good = goodThreshold(catalog)
        var worth: [Shelf.Entry] = []
        var tonight: [Shelf.Entry] = []
        var seen = Set<String>()
        for (day, games) in fetched {
            for game in games {
                let entry = Shelf.Entry(game: game, day: day)
                guard seen.insert(entry.id).inserted else { continue }
                if game.isFinal, let rating = game.rating, rating >= good {
                    worth.append(entry)
                } else if !game.isFinal, Calendar.current.isDate(day, inSameDayAs: today) {
                    tonight.append(entry)
                }
            }
        }

        worth.sort { ($0.game.rating ?? 0, $0.game.start ?? .distantPast) > ($1.game.rating ?? 0, $1.game.start ?? .distantPast) }
        tonight.sort { a, b in
            // Live first — the thing happening right now belongs at the left
            // edge, where the shelf's focus lands.
            if a.game.isLive != b.game.isLive { return a.game.isLive }
            return (a.game.start ?? .distantFuture) < (b.game.start ?? .distantFuture)
        }

        return Shelf(sections: [
            Shelf.Section(title: "Worth watching", entries: Array(worth.prefix(maxItems))),
            Shelf.Section(title: "On tonight", entries: Array(tonight.prefix(maxItems))),
        ].filter { !$0.entries.isEmpty })
    }
}

struct TimeoutError: Error {}

/// Runs `operation` and gives up after `seconds`. The Top Shelf host shows the
/// static image if the extension takes too long, so a slow league must lose its
/// row, never the whole shelf.
func withTimeout<T: Sendable>(_ seconds: TimeInterval,
                              _ operation: @escaping @Sendable () async throws -> T) async throws -> T {
    try await withThrowingTaskGroup(of: T.self) { group in
        group.addTask { try await operation() }
        group.addTask {
            try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            throw TimeoutError()
        }
        let first = try await group.next()!
        group.cancelAll()
        return first
    }
}
