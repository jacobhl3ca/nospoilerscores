import Foundation

// Live end-to-end check of the Apple TV app's data path, run from the terminal:
// the real catalog off hidescore.com, the real ESPN requests, the real parser,
// the real rating. If this prints a board, the app will show one.
//
//   ./smoke.sh [YYYYMMDD]

let ymd = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ServiceDay.ymd(ServiceDay.today())
let day = Date()

let sem = DispatchSemaphore(value: 0)
Task {
    let catalog = await CatalogLoader.load()
    print("catalog: schema \(catalog.schema) · \(catalog.leagues.count) leagues · base \(catalog.espnBase)")

    let defaults = catalog.leagues.filter { $0.defaultOn && $0.inSeason(on: day) }
    print("default leagues in season on \(ymd): \(defaults.map(\.label).joined(separator: ", "))\n")

    var total = 0, rated = 0, failures = 0
    for league in defaults {
        do {
            let games = try await ESPN.slate(for: league, ymd: ymd, base: catalog.espnBase)
            total += games.count
            rated += games.filter { $0.rating != nil }.count
            print("\(league.label) — \(games.count) game(s)")
            for game in games.prefix(4) {
                let tier = game.rating.flatMap { catalog.tier(for: $0)?.label } ?? "—"
                let state = game.isFinal ? "Final" : (game.isLive ? "LIVE \(game.statusDetail)" : (game.start?.description ?? "?"))
                let channel = game.broadcasts.first ?? "—"
                // The score is deliberately not printed: this tool checks the
                // board, and the board never shows one.
                print("   \(game.away.shortName) at \(game.home.shortName)  ·  \(state)  ·  \(channel)  ·  \(tier)")
            }
        } catch {
            failures += 1
            print("\(league.label) — FAILED: \(error)")
        }
        print("")
    }
    print("total \(total) games · \(rated) rated · \(failures) league fetch failures")
    exit(failures == 0 && total > 0 ? 0 : 1)
}
sem.wait()
