import Foundation
import Combine

/// Everything the viewer has chosen, in `UserDefaults`.
///
/// On tvOS that is the right store rather than a compromise: the system backs it
/// with iCloud automatically (1 MB cap), so a household with two Apple TVs gets
/// the same leagues on both without the app asking for an iCloud entitlement or
/// an account. The parts the Top Shelf needs are mirrored into the app group on
/// every change — see `SharedPreferences`.
final class Preferences: ObservableObject {
    private let defaults = UserDefaults.standard

    /// League keys the viewer follows. Empty means "not chosen yet" — the app
    /// falls back to the catalog's defaults rather than showing nothing.
    @Published var followedLeagues: Set<String> {
        didSet { defaults.set(Array(followedLeagues), forKey: Key.followed); mirror() }
    }

    /// Show the spoiler-safe worth-watching badge. On by default: it is the
    /// reason to open the app on a TV, and it reveals quality, never the score.
    @Published var showRatings: Bool {
        didSet { defaults.set(showRatings, forKey: Key.ratings); mirror() }
    }

    /// Show scores everywhere without pressing Select. Off by default — the app
    /// is called HideScore — but somebody watching live wants it.
    @Published var revealScores: Bool {
        didSet { defaults.set(revealScores, forKey: Key.reveal) }
    }

    /// Drop leagues that are out of season from the Leagues picker.
    @Published var hideOffseason: Bool {
        didSet { defaults.set(hideOffseason, forKey: Key.hideOffseason) }
    }

    private enum Key {
        static let followed = "followedLeagues"
        static let ratings = "showRatings"
        static let reveal = "revealScores"
        static let hideOffseason = "hideOffseason"
    }

    init() {
        defaults.register(defaults: [Key.ratings: true, Key.reveal: false, Key.hideOffseason: true])
        followedLeagues = Set(defaults.stringArray(forKey: Key.followed) ?? [])
        showRatings = defaults.bool(forKey: Key.ratings)
        revealScores = defaults.bool(forKey: Key.reveal)
        hideOffseason = defaults.bool(forKey: Key.hideOffseason)
        // A viewer upgrading from 1.0 has picks the shelf has never seen.
        mirror()
    }

    private func mirror() {
        SharedPreferences.mirror(followed: followedLeagues, showRatings: showRatings)
    }

    func toggle(_ leagueKey: String, defaultsFrom catalog: Catalog) {
        // The first edit has to freeze the implicit defaults, or un-following one
        // of them would look like it did nothing (the set is still empty, so the
        // catalog defaults come back).
        if followedLeagues.isEmpty {
            followedLeagues = Set(catalog.leagues.filter(\.defaultOn).map(\.key))
        }
        if followedLeagues.contains(leagueKey) {
            followedLeagues.remove(leagueKey)
        } else {
            followedLeagues.insert(leagueKey)
        }
    }

    func isFollowed(_ leagueKey: String, in catalog: Catalog) -> Bool {
        SharedPreferences.isFollowed(leagueKey, followed: followedLeagues, in: catalog)
    }
}
