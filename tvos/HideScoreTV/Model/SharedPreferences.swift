import Foundation

/// The slice of the viewer's preferences the Top Shelf extension needs, kept in
/// the app group's `UserDefaults` so a process that is not the app can read it.
///
/// The app mirrors into it on every change (see `Preferences`); the extension
/// only ever reads. If the app group is missing from a build — no entitlement,
/// no provisioning — `UserDefaults(suiteName:)` still hands back an object, it
/// just isn't shared: the shelf then falls back to the catalog's defaults, which
/// is the honest degraded state rather than a blank shelf.
enum SharedPreferences {
    static let appGroup = "group.com.jacobhl.hidescore"

    private enum Key {
        static let followed = "followedLeagues"
        static let ratings = "showRatings"
    }

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func mirror(followed: Set<String>, showRatings: Bool) {
        guard let d = defaults else { return }
        d.set(followed.sorted(), forKey: Key.followed)
        d.set(showRatings, forKey: Key.ratings)
    }

    static func followedLeagues() -> Set<String> {
        Set(defaults?.stringArray(forKey: Key.followed) ?? [])
    }

    static func showRatings() -> Bool {
        (defaults?.object(forKey: Key.ratings) as? Bool) ?? true
    }

    /// Same rule as `Preferences.isFollowed`: an empty set means the viewer never
    /// chose, so the catalog's defaults apply.
    static func isFollowed(_ leagueKey: String, followed: Set<String>, in catalog: Catalog) -> Bool {
        followed.isEmpty ? (catalog.league(leagueKey)?.defaultOn ?? false) : followed.contains(leagueKey)
    }

    /// The shared container. The shelf's rendered tiles live here because the
    /// Top Shelf is drawn by the system, not by the extension, and the system
    /// can read an app group container but not the extension's own tmp.
    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }
}
