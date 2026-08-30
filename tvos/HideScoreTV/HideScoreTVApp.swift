import SwiftUI

@main
struct HideScoreTVApp: App {
    @StateObject private var preferences: Preferences
    @StateObject private var model: AppModel

    init() {
        // One Preferences instance, shared by the model and the views — the
        // model reads it to decide which leagues to fetch, the views bind to it.
        let prefs = Preferences()
        _preferences = StateObject(wrappedValue: prefs)
        _model = StateObject(wrappedValue: AppModel(preferences: prefs))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .environmentObject(preferences)
                .preferredColorScheme(.dark)
        }
    }
}
