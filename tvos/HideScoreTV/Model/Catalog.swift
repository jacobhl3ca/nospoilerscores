import Foundation

/// The league table the app runs on.
///
/// A native tvOS app cannot share `src/lib/espn.ts` the way the iOS shell shares
/// the whole website, so the one thing that would rot fastest — which leagues
/// exist, where ESPN serves them, when their season runs, how each one is
/// scored — is data, not code. `scripts/build-tv-catalog.mjs` generates it
/// straight out of the TypeScript source and `npm run tv:catalog:check` fails
/// the build if the two drift. The app fetches the live copy on every launch and
/// falls back to the bundled one, so adding a league is a website push, never an
/// App Store review.
struct Catalog: Codable {
    struct Tier: Codable {
        let min: Int
        let label: String
        let color: String
    }

    struct Season: Codable {
        let start: String?          // "MM-DD"
        let end: String?            // "MM-DD", inclusive
        let cycleMod: Int?          // World Cup / Euro: every N years…
        let cycleAnchor: Int?       // …anchored on this championship year
    }

    struct RatingConfig: Codable {
        let kind: String            // "generic" | "cricket" | "volleyball"
        let multiplier: Double
        let overtimeBonus: Double
        let scoringDivisor: Double
        let regulationPeriods: Int
        let periodSeconds: Double?  // count-down sports only
        let soccer: Bool
    }

    struct League: Codable, Identifiable, Hashable {
        let key: String
        let label: String
        let path: String
        let logo: String?
        let defaultOn: Bool
        let season: Season
        let rating: RatingConfig

        var id: String { key }
        static func == (a: League, b: League) -> Bool { a.key == b.key }
        func hash(into h: inout Hasher) { h.combine(key) }
    }

    let schema: Int
    let espnBase: String
    let ratingTiers: [Tier]
    let leagues: [League]

    static let schemaVersion = 1

    func league(_ key: String) -> League? { leagues.first { $0.key == key } }

    /// Highest tier whose threshold the rating clears. `ratingTiers` is ordered
    /// high → low by the generator, but sort defensively so a hand-edited
    /// catalog can't silently invert the badges.
    func tier(for rating: Int) -> Tier? {
        ratingTiers.sorted { $0.min > $1.min }.first { rating >= $0.min }
    }
}

// MARK: - Loading

enum CatalogLoader {
    static let remoteURL = URL(string: "https://hidescore.com/tv/catalog.json")!

    private static var cacheURL: URL? {
        guard let dir = try? FileManager.default.url(for: .applicationSupportDirectory,
                                                     in: .userDomainMask,
                                                     appropriateFor: nil, create: true) else { return nil }
        return dir.appendingPathComponent("tv-catalog.json")
    }

    /// Bundled copy — always present, always valid, never newer than the binary.
    static func bundled() -> Catalog {
        // Xcode's synchronized groups may flatten `Resources/` into the bundle
        // root or keep it as a directory depending on how the folder is typed,
        // and a catalog that silently fails to load would leave the app with no
        // leagues at all. Look in both places.
        let url = Bundle.main.url(forResource: "catalog", withExtension: "json")
            ?? Bundle.main.url(forResource: "catalog", withExtension: "json", subdirectory: "Resources")
        guard let url,
              let data = try? Data(contentsOf: url),
              let catalog = try? JSONDecoder().decode(Catalog.self, from: data) else {
            // The bundled catalog is a build input, so this is unreachable in a
            // shipped build. An empty catalog keeps the app on screen with an
            // honest "no leagues" state rather than trapping.
            return Catalog(schema: Catalog.schemaVersion, espnBase: "", ratingTiers: [], leagues: [])
        }
        return catalog
    }

    /// Live catalog if the network cooperates, then the last good download, then
    /// the bundled copy. A newer *schema* is refused rather than half-decoded:
    /// an old binary must not guess at a shape it was never built for.
    static func load() async -> Catalog {
        var request = URLRequest(url: remoteURL)
        request.timeoutInterval = 8
        request.cachePolicy = .reloadRevalidatingCacheData
        if let (data, response) = try? await URLSession.shared.data(for: request),
           (response as? HTTPURLResponse)?.statusCode == 200,
           let fresh = try? JSONDecoder().decode(Catalog.self, from: data),
           fresh.schema == Catalog.schemaVersion, !fresh.leagues.isEmpty {
            if let cacheURL { try? data.write(to: cacheURL, options: .atomic) }
            return fresh
        }
        if let cacheURL, let data = try? Data(contentsOf: cacheURL),
           let cached = try? JSONDecoder().decode(Catalog.self, from: data),
           cached.schema == Catalog.schemaVersion, !cached.leagues.isEmpty {
            return cached
        }
        return bundled()
    }
}

// MARK: - Season windows

extension Catalog.League {
    /// Is this league in season on `date`? Mirrors `isLeagueActive` in espn.ts:
    /// MM-DD windows that may wrap the new year, plus the every-N-years cycle the
    /// World Cup and the Euro run on.
    func inSeason(on date: Date, calendar: Calendar = .current) -> Bool {
        guard let start = season.start, let end = season.end else { return true }
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        guard let year = parts.year, let month = parts.month, let day = parts.day else { return true }
        let mmdd = String(format: "%02d-%02d", month, day)

        if let mod = season.cycleMod, let anchor = season.cycleAnchor, mod > 0 {
            // A window that wraps the year belongs to the year it ENDS in.
            let seasonYear = (start > end && mmdd >= start) ? year + 1 : year
            let offset = ((seasonYear - anchor) % mod + mod) % mod
            if offset != 0 { return false }
        }
        return start <= end ? (mmdd >= start && mmdd <= end)
                            : (mmdd >= start || mmdd <= end)
    }
}
