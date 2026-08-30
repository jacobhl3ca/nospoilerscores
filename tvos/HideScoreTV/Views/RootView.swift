import SwiftUI

struct RootView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        TabView {
            TonightView()
                .tabItem { Label("Tonight", systemImage: "tv") }
            WorthWatchingView()
                .tabItem { Label("Worth Watching", systemImage: "star") }
            LeaguesView()
                .tabItem { Label("Leagues", systemImage: "list.bullet") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .background(Brand.background.ignoresSafeArea())
        .task { await model.bootstrap() }
    }
}
