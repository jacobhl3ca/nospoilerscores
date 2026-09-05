import SwiftUI

/// What's on, league by league, with every score hidden.
struct TonightView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var preferences: Preferences
    @State private var selected: Game?

    var body: some View {
        ScrollView(.vertical) {
            LazyVStack(alignment: .leading, spacing: 44) {
                dateBar
                let slates = model.slates(for: model.day)
                let failed = slates.filter(\.failed)
                if model.isLoading(model.day) && slates.isEmpty {
                    ProgressView().frame(maxWidth: .infinity).padding(.vertical, 120)
                } else if model.activeLeagues(on: model.day).isEmpty {
                    StatusNote(symbol: "list.bullet",
                               title: "No leagues followed",
                               detail: "Pick the sports you care about in the Leagues tab.")
                } else if !failed.isEmpty && failed.count == slates.count {
                    // Every league failed at once: that is the Apple TV's
                    // connection, not five separate outages, so say it once.
                    StatusNote(symbol: "wifi.exclamationmark",
                               title: "Couldn't reach the scoreboard",
                               detail: "None of your leagues answered. Check the Apple TV's connection, then try again.",
                               action: { Task { await model.load(day: model.day, force: true) } })
                } else if slates.allSatisfy({ $0.games.isEmpty && !$0.failed }) {
                    StatusNote(symbol: "moon.zzz",
                               title: "Nothing on \(ServiceDay.title(model.day, relativeTo: model.today).lowercased())",
                               detail: "Nothing scheduled for the leagues you follow.")
                } else {
                    ForEach(slates) { slate in
                        if slate.failed {
                            shelfHeader(slate)
                            StatusNote(symbol: "exclamationmark.triangle",
                                       title: "\(slate.league.label) didn't load",
                                       detail: "The scoreboard feed didn't answer. That's not an empty schedule.",
                                       action: { Task { await model.load(day: model.day, force: true) } })
                        } else if !slate.games.isEmpty {
                            shelf(slate)
                        }
                    }
                }
            }
            .padding(.horizontal, 70)
            .padding(.bottom, 70)
        }
        .background(Brand.background.ignoresSafeArea())
        .fullScreenCover(item: $selected) { game in
            GameDetailView(game: game).environmentObject(model)
        }
        .task { await model.load(day: model.day) }
        .onChange(of: model.day) { _, _ in Task { await model.load(day: model.day) } }
    }

    private var dateBar: some View {
        HStack(spacing: 22) {
            Text(ServiceDay.title(model.day, relativeTo: model.today))
                .font(.system(size: Type.title, weight: .bold))
            Spacer()
            Button {
                model.day = ServiceDay.offset(-1, from: model.day)
            } label: {
                Label("Previous day", systemImage: "chevron.left").labelStyle(.iconOnly)
            }
            Button("Today") { model.day = model.today }
                .disabled(Calendar.current.isDate(model.day, inSameDayAs: model.today))
            Button {
                model.day = ServiceDay.offset(1, from: model.day)
            } label: {
                Label("Next day", systemImage: "chevron.right").labelStyle(.iconOnly)
            }
        }
        .padding(.top, 20)
    }

    private func shelfHeader(_ slate: LeagueSlate) -> some View {
        HStack(spacing: 14) {
            if let logo = slate.league.logo, let url = URL(string: logo) {
                AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { Color.clear }
                    .frame(width: 38, height: 38)
            }
            Text(slate.league.label).font(.system(size: Type.shelf, weight: .bold))
            Text("\(slate.games.count)")
                .font(.system(size: Type.caption, weight: .semibold))
                .foregroundStyle(Brand.secondary)
            Spacer()
        }
    }

    private func shelf(_ slate: LeagueSlate) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            shelfHeader(slate)
            ScrollView(.horizontal) {
                LazyHStack(spacing: 44) {
                    ForEach(slate.games) { game in
                        GameCardView(game: game,
                                     catalog: model.catalog,
                                     showRatings: preferences.showRatings,
                                     revealScores: preferences.revealScores) { selected = game }
                    }
                }
                .padding(.vertical, 30)
                .padding(.horizontal, 6)
            }
            .scrollClipDisabled()
        }
        .focusSection()
    }
}
