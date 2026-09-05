import SwiftUI

/// Which sports show up on the board.
///
/// The list is the catalog, which is fetched from hidescore.com on every launch
/// — so a league added to the website appears here without an app update.
struct LeaguesView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var preferences: Preferences

    private let columns = [GridItem(.adaptive(minimum: 440, maximum: 560), spacing: 32)]

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Leagues").font(.system(size: Type.title, weight: .bold))
                    Text("Pick what shows up on your board — and on the Home screen's Top Shelf.")
                        .font(.system(size: Type.detail)).foregroundStyle(Brand.secondary)
                }
                .padding(.top, 20)

                Toggle("Hide leagues that are out of season", isOn: $preferences.hideOffseason)
                    .font(.system(size: Type.detail))
                    .frame(maxWidth: 900)

                LazyVGrid(columns: columns, alignment: .leading, spacing: 32) {
                    ForEach(visibleLeagues) { league in
                        leagueTile(league)
                    }
                }
                .padding(.vertical, 20)
            }
            .padding(.horizontal, 70)
            .padding(.bottom, 70)
        }
        .background(Brand.background.ignoresSafeArea())
    }

    /// In-season leagues first, then the rest — a catalog sorted purely
    /// alphabetically buries whatever is actually playing tonight.
    private var visibleLeagues: [Catalog.League] {
        let today = model.today
        let all = model.catalog.leagues
        let inSeason = all.filter { $0.inSeason(on: today) }
        if preferences.hideOffseason {
            // Anything already followed stays visible even out of season, or
            // un-following it would mean waiting for next season.
            let followedOff = all.filter { !$0.inSeason(on: today) && preferences.followedLeagues.contains($0.key) }
            return inSeason + followedOff
        }
        return inSeason + all.filter { !$0.inSeason(on: today) }
    }

    private func leagueTile(_ league: Catalog.League) -> some View {
        let on = preferences.isFollowed(league.key, in: model.catalog)
        let active = league.inSeason(on: model.today)
        return Button {
            preferences.toggle(league.key, defaultsFrom: model.catalog)
            Task { await model.load(day: model.day, force: true) }
        } label: {
            HStack(spacing: 18) {
                if let logo = league.logo, let url = URL(string: logo) {
                    AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { Color.clear }
                        .frame(width: 44, height: 44)
                } else {
                    Image(systemName: "sportscourt").frame(width: 44, height: 44)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(league.label).font(.system(size: Type.body, weight: .semibold)).lineLimit(1)
                    if !active {
                        Text("Off-season").font(.system(size: Type.label)).foregroundStyle(Brand.secondary)
                    }
                }
                Spacer()
                Image(systemName: on ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 32))
                    .foregroundStyle(on ? Brand.accent : Brand.secondary)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 20)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.card)
        .accessibilityLabel("\(league.label), \(on ? "following" : "not following")")
    }
}
