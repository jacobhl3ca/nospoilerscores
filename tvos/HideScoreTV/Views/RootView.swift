import SwiftUI

struct RootView: View {
    @EnvironmentObject var model: AppModel
    @State private var tab = DemoMode.initialTab

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
        .task { await model.bootstrap() }
    }
}
