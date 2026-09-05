import Foundation
import Combine
#if canImport(TVServices)
import TVServices
#endif

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var catalog: Catalog = DemoMode.apply(CatalogLoader.bundled())
    @Published private(set) var days: [String: [LeagueSlate]] = [:]   // ymd → slates
    @Published private(set) var loading: Set<String> = []             // ymd currently in flight
    @Published private(set) var lastUpdated: Date?
    @Published var day: Date = ServiceDay.today() {
        didSet { dayFollowsToday = Calendar.current.isDate(day, inSameDayAs: today) }
    }

    let preferences: Preferences

    /// True while the board is showing "today", so a rollover past 1 AM — or a
    /// TV woken the next evening — moves it to the new day instead of leaving it
    /// on a date now labelled "Yesterday".
    private var dayFollowsToday = true
    private var inflight: [String: Task<Void, Never>] = [:]
    private var refreshTask: Task<Void, Never>?
    private var lastShelfSignature = ""

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

    /// The freshest copy of a game the board knows about, so a detail card opened
    /// on a live game keeps ticking with the auto-refresh instead of freezing at
    /// the moment it was opened.
    func current(_ game: Game) -> Game {
        for slates in days.values {
            for slate in slates where slate.league.key == game.leagueKey {
                if let fresh = slate.games.first(where: { $0.id == game.id }) { return DemoMode.apply(fresh, in: slate) }
            }
        }
        return game
    }

    func game(id: String, league: String, on day: Date) -> Game? {
        slates(for: day).first { $0.league.key == league }?.games.first { $0.id == id }
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
        if let running = inflight[ymd] {
            // Share the fetch already under way rather than skipping — a deep
            // link that arrives during launch would otherwise find nothing —
            // and rather than doubling the ESPN traffic.
            await running.value
            if !force { return }
        }
        if !force && days[ymd] != nil && !isStale(day) { return }
        let task = Task { await self.fetch(ymd: ymd, day: day) }
        inflight[ymd] = task
        await task.value
        if inflight[ymd] == task { inflight[ymd] = nil }
    }

    private func fetch(ymd: String, day: Date) async {
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
        shelfDidChange()
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

    // MARK: Top Shelf

    /// Tell the system the Home screen shelf may have changed — but only when
    /// what it could show actually did. With live games the board refreshes
    /// every minute, and each notice makes the extension fetch and render again.
    private func shelfDidChange() {
        let today = self.today
        let signature = (slates(for: today) + slates(for: ServiceDay.offset(-1, from: today)))
            .flatMap(\.games)
            .map { "\($0.leagueKey):\($0.id):\($0.state):\($0.statusDetail):\($0.rating ?? -1)" }
            .joined(separator: "|")
        guard signature != lastShelfSignature else { return }
        lastShelfSignature = signature
        #if canImport(TVServices)
        TVTopShelfContentProvider.topShelfContentDidChange()
        #endif
    }

    // MARK: Scene

    /// Back from the background — typically back from watching the game the
    /// board sent you to. Roll the day if it changed, refresh if the board is
    /// older than a minute, and restart the refresh loop.
    func becameActive() async {
        if dayFollowsToday && !Calendar.current.isDate(day, inSameDayAs: today) { day = today }
        await load(day: day, force: isStale(day))
        startAutoRefresh()
    }

    func wentToBackground() {
        stopAutoRefresh()
    }

    // MARK: Deep links

    /// `hidescore://game?league=mlb&id=401…&day=20260904` — what a Top Shelf
    /// item opens. Loads the day if the board doesn't have it yet.
    func game(for url: URL) async -> Game? {
        guard url.scheme == "hidescore", url.host == "game",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else { return nil }
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value }
        guard let league = value("league"), let id = value("id") else { return nil }
        let day = value("day").flatMap { ServiceDay.date(fromYMD: $0) } ?? today
        await load(day: day)
        return game(id: id, league: league, on: day)
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
