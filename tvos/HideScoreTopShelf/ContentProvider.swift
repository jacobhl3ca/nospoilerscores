import TVServices
import os

/// The Home screen's Top Shelf: last night's games worth watching, then what's
/// on tonight — every score still hidden. Selecting a tile opens the game's
/// card in the app; Play/Pause does the same.
///
/// The system shows the static shelf image until this returns, and falls back
/// to it if this takes too long, so every network call in the builder is on a
/// short timeout: a slow league loses its row, never the whole shelf.
final class ContentProvider: TVTopShelfContentProvider {
    private let log = Logger(subsystem: "com.jacobhl.hidescore", category: "topshelf")

    override func loadTopShelfContent() async -> (any TVTopShelfContent)? {
        let catalog = await CatalogLoader.load()
        let followed = SharedPreferences.followedLeagues()
        let showRatings = SharedPreferences.showRatings()
        let shelf = await ShelfBuilder.build(catalog: catalog) {
            SharedPreferences.isFollowed($0.key, followed: followed, in: catalog)
        }
        guard !shelf.isEmpty else {
            log.notice("nothing to show — \(followed.count) followed leagues, \(catalog.leagues.count) in catalog")
            return nil
        }

        let size = TVTopShelfSectionedContent.imageSize(for: .hdtv)
        let store = ShelfImageStore(directory: (SharedPreferences.containerURL ?? FileManager.default.temporaryDirectory)
            .appendingPathComponent("TopShelf", isDirectory: true))
        let games = shelf.sections.flatMap { $0.entries.map(\.game) }
        let logos = await ShelfTiles.logos(for: games)
        log.notice("shelf: \(shelf.sections.count) sections, \(games.count) games, \(logos.count) logos, tile \(Int(size.width))x\(Int(size.height))")

        var sections: [TVTopShelfItemCollection<TVTopShelfSectionedItem>] = []
        for section in shelf.sections {
            var items: [TVTopShelfSectionedItem] = []
            for entry in section.entries {
                let item = TVTopShelfSectionedItem(identifier: entry.id)
                item.imageShape = .hdtv
                item.title = entry.game.matchup
                item.displayAction = TVTopShelfAction(url: entry.deepLink)
                item.playAction = TVTopShelfAction(url: entry.deepLink)
                let tile = ShelfTiles.tile(for: entry.game, catalog: catalog, showRatings: showRatings, logos: logos)
                if let one = store.url(for: tile, key: entry.id, size: size, scale: 1),
                   let two = store.url(for: tile, key: entry.id, size: size, scale: 2) {
                    item.setImageURL(one, for: .screenScale1x)
                    item.setImageURL(two, for: .screenScale2x)
                }
                items.append(item)
            }
            let collection = TVTopShelfItemCollection(items: items)
            collection.title = section.title
            sections.append(collection)
        }
        store.prune()
        return TVTopShelfSectionedContent(sections: sections)
    }
}
