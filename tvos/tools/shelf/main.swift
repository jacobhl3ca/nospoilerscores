import Foundation
import CoreGraphics

// Renders the Top Shelf on a Mac, from the terminal: the live catalog, the real
// ESPN requests, the same builder and the same CoreGraphics renderer the
// extension runs. Writes one PNG per tile so the shelf can be looked at before
// an Apple TV ever shows it. Prints no scores — the shelf never carries one.
//
//   ./shelf.sh [out-dir] [league,league]

let outDir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "out")
let only: Set<String>? = CommandLine.arguments.count > 2 ? Set(CommandLine.arguments[2].split(separator: ",").map(String.init)) : nil
// The tvOS HDTV tile is 16:9; the extension asks TVServices for the exact size
// at runtime. This is a stand-in of the same shape for eyeballing the layout.
let size = CGSize(width: 908, height: 512)

let sem = DispatchSemaphore(value: 0)
Task {
    let started = Date()
    let catalog = await CatalogLoader.load()
    let shelf = await ShelfBuilder.build(catalog: catalog) { league in
        only.map { $0.contains(league.key) } ?? league.defaultOn
    }
    let games = shelf.sections.flatMap { $0.entries.map(\.game) }
    let logos = await ShelfTiles.logos(for: games)
    print("catalog \(catalog.leagues.count) leagues · \(shelf.sections.count) sections · \(games.count) tiles · \(logos.count) logos · \(String(format: "%.1f", Date().timeIntervalSince(started)))s")

    try? FileManager.default.removeItem(at: outDir)
    let store = ShelfImageStore(directory: outDir)
    var written = 0
    for section in shelf.sections {
        print("\n\(section.title)")
        for (index, entry) in section.entries.enumerated() {
            let tile = ShelfTiles.tile(for: entry.game, catalog: catalog, showRatings: true, logos: logos)
            let badge = tile.badge?.label ?? "—"
            print("   \(index + 1). \(entry.game.matchup)  ·  \(tile.status)  ·  \(tile.channel ?? "—")  ·  \(badge)  →  \(entry.deepLink.absoluteString)")
            if store.url(for: tile, key: entry.id, size: size, scale: 2) != nil { written += 1 }
        }
    }
    print("\nwrote \(written) tiles to \(outDir.path)")
    exit(shelf.isEmpty ? 1 : 0)
}
sem.wait()
