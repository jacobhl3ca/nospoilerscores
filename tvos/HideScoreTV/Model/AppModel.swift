import Foundation
import Combine

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var catalog: Catalog = DemoMode.apply(CatalogLoader.bundled())
    @Published private(set) var days: [String: [LeagueSlate]] = [:]   // ymd → slates
    @Published private(set) var loading: Set<String> = []             // ymd currently in flight
    @Published private(set) var lastUpdated: Date?
    @Published var day: Date = ServiceDay.today()

    let preferences: Preferences
    private var refreshTask: Task<Void, Never>?

    init(preferences: Preferences) {
        self.preferences = preferences
    }

    // MARK: Derived

    var today: Date { ServiceDay.today() }

    /// Leagues the viewer follows that are actually in season on the day being
    /// looked at. A followed league that is out of season is not an error and
    /// not an empty shelf — it simply isn't on tonight.
    func activeLeagues(on day: Date) -> [Catalog.League] {
        catalog.leagues.filter { preferences.isFollowed($0.key, in: catalog) && $0.inSeason(on: day) }
    }

    func slates(for day: Date) -> [LeagueSlate] {
        DemoMode.apply(days[ServiceDay.ymd(day)] ?? [])
    }

    func isLoading(_ day: Date) -> Bool { loading.contains(ServiceDay.ymd(day)) }

    /// Finished games across the last two days, best first. This is the board
    /// the app exists for on a TV: you are about to watch something, and this
    /// says which of last night's games deserve it — without saying who won.
    func worthWatching() -> [Game] {
        let today = self.today
        let games = (slates(for: today) + slates(for: ServiceDay.offset(-1, from: today)))
            .flatMap(\.games)
            .filter { $0.isFinal && $0.rating != nil }
        var seen = Set<String>()
        return games
            .sorted { ($0.rating ?? 0, $0.start ?? .distantPast) > ($1.rating ?? 0, $1.start ?? .distantPast) }
            .filter { seen.insert($0.id).inserted }
    }

    var hasLiveGames: Bool {
        slates(for: day).contains { $0.games.contains(where: \.isLive) }
    }

    // MARK: Loading

    func bootstrap() async {
        catalog = DemoMode.apply(await CatalogLoader.load())
        await load(day: today)
        await load(day: ServiceDay.offset(-1, from: today))
        startAutoRefresh()
    }

    func load(day: Date, force: Bool = false) async {
        let ymd = ServiceDay.ymd(day)
        if loading.contains(ymd) { return }
        if !force && days[ymd] != nil && !isStale(day) { return }
        let leagues = activeLeagues(on: day)
        guard !leagues.isEmpty else { days[ymd] = []; return }

        loading.insert(ymd)
        defer { loading.remove(ymd) }

        let base = catalog.espnBase
        // One request per league, in parallel. A league that fails is marked
        // failed and keeps its shelf with a retry — a broken feed is not the
        // same thing as a day with nothing on it, and conflating the two is
        // exactly how a silent outage looks like an empty schedule.
        let results = await withTaskGroup(of: LeagueSlate.self) { group -> [LeagueSlate] in
            for league in leagues {
                group.addTask {
                    do {
                        let games = try await ESPN.slate(for: league, ymd: ymd, base: base)
                        return LeagueSlate(league: league, games: Self.order(games))
                    } catch {
                        return LeagueSlate(league: league, games: [], failed: true)
                    }
                }
            }
            var out: [LeagueSlate] = []
            for await slate in group { out.append(slate) }
            return out
        }

        let order = Dictionary(uniqueKeysWithValues: leagues.enumerated().map { ($0.element.key, $0.offset) })
        days[ymd] = results.sorted { (order[$0.league.key] ?? 0) < (order[$1.league.key] ?? 0) }
        lastUpdated = Date()
    }

    /// Live first, then upcoming by start time, then finals. On a TV the thing
    /// happening right now belongs at the left edge of the shelf where focus
    /// lands.
    private nonisolated static func order(_ games: [Game]) -> [Game] {
        games.sorted { a, b in
            func rank(_ g: Game) -> Int { g.isLive ? 0 : (g.state == "pre" ? 1 : 2) }
            if rank(a) != rank(b) { return rank(a) < rank(b) }
            return (a.start ?? .distantFuture) < (b.start ?? .distantFuture)
        }
    }

    private func isStale(_ day: Date) -> Bool {
        guard let lastUpdated else { return true }
        return Date().timeIntervalSince(lastUpdated) > 60
    }

    // MARK: Auto refresh

    /// Live scores need a tighter loop than a finished slate, but an Apple TV
    /// left on a menu for hours must not hammer ESPN either.
    private func startAutoRefresh() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                let interval: UInt64 = (self?.hasLiveGames ?? false) ? 60 : 300
                try? await Task.sleep(nanoseconds: interval * 1_000_000_000)
                guard let self, !Task.isCancelled else { return }
                await self.load(day: self.day, force: true)
            }
        }
    }

    func stopAutoRefresh() {
        refreshTask?.cancel()
        refreshTask = nil
    }
}
