import SwiftUI

struct RootView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab = DemoMode.initialTab
    /// A game opened from outside — the Home screen's Top Shelf.
    @State private var linked: Game?

    var body: some View {
        TabView(selection: $tab) {
            TonightView()
                .tabItem { Label("Tonight", systemImage: "tv") }
                .tag(0)
            WorthWatchingView()
                .tabItem { Label("Worth Watching", systemImage: "star") }
                .tag(1)
            LeaguesView()
                .tabItem { Label("Leagues", systemImage: "list.bullet") }
                .tag(2)
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
                .tag(3)
        }
        .background(Brand.background.ignoresSafeArea())
        .fullScreenCover(item: $linked) { game in
            GameDetailView(game: game).environmentObject(model)
        }
        .task { await model.bootstrap() }
        // hidescore://game?… from a Top Shelf item. Works cold or warm: the
        // model shares the fetch already in flight rather than skipping it.
        .onOpenURL { url in
            Task { linked = await model.game(for: url) }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active: Task { await model.becameActive() }
            case .background: model.wentToBackground()
            default: break
            }
        }
    }
}
