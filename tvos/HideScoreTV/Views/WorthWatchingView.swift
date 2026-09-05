import SwiftUI

/// The board the app exists for on a television: last night's finished games,
/// best first, with the scores still hidden. You pick what to watch from the
/// quality signal alone.
struct WorthWatchingView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var preferences: Preferences
    @State private var selected: Game?

    private let columns = [GridItem(.adaptive(minimum: GameCardView.size.width, maximum: GameCardView.size.width), spacing: 44)]

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 26) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Worth Watching").font(.system(size: Type.title, weight: .bold))
                    Text("Finished games from the last two days, ranked by how close they were. No scores, no winners.")
                        .font(.system(size: Type.detail))
                        .foregroundStyle(Brand.secondary)
                }
                .padding(.top, 20)

                let games = model.worthWatching()
                if games.isEmpty {
                    StatusNote(symbol: "sparkles",
                               title: "Nothing rated yet",
                               detail: "Ratings appear once games finish. Check back after tonight's slate.")
                } else {
                    LazyVGrid(columns: columns, alignment: .leading, spacing: 44) {
                        ForEach(games) { game in
                            GameCardView(game: game,
                                         catalog: model.catalog,
                                         showRatings: true,
                                         revealScores: preferences.revealScores) { selected = game }
                        }
                    }
                    .padding(.vertical, 20)
                }
            }
            .padding(.horizontal, 70)
            .padding(.bottom, 70)
        }
        .background(Brand.background.ignoresSafeArea())
        .fullScreenCover(item: $selected) { game in
            GameDetailView(game: game).environmentObject(model)
        }
        .task {
            await model.load(day: model.today)
            await model.load(day: ServiceDay.offset(-1, from: model.today))
            // Screenshot staging only — see DemoMode.
            if DemoMode.opensDetail { selected = model.worthWatching().first }
        }
    }
}
