import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var model: AppModel
    @EnvironmentObject var preferences: Preferences

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 34) {
                Text("Settings").font(.system(size: Type.title, weight: .bold)).padding(.top, 20)

                VStack(alignment: .leading, spacing: 22) {
                    Toggle("Show worth-watching ratings", isOn: $preferences.showRatings)
                    Text("A game's rating says how close it was. It never says who won or by how much.")
                        .font(.system(size: Type.caption)).foregroundStyle(Brand.secondary)

                    Toggle("Always show scores", isOn: $preferences.revealScores)
                    Text("Off by default. With this on, scores appear on every card without pressing Select. The Home screen's Top Shelf never shows one either way.")
                        .font(.system(size: Type.caption)).foregroundStyle(Brand.secondary)
                }
                .font(.system(size: Type.body))
                .frame(maxWidth: 1000, alignment: .leading)

                Divider().overlay(Brand.hairline).frame(maxWidth: 1000)

                VStack(alignment: .leading, spacing: 10) {
                    Text("About").font(.system(size: 32, weight: .semibold))
                    aboutRow("Version", Bundle.main.versionSummary)
                    aboutRow("Leagues in catalog", "\(model.catalog.leagues.count)")
                    if let updated = model.lastUpdated {
                        aboutRow("Scores updated", updated.clockTime())
                    }
                    Text("Scores and schedules come from public scoreboard feeds. HideScore is not affiliated with, endorsed by, or sponsored by any league, team, or broadcaster.")
                        .font(.system(size: Type.caption))
                        .foregroundStyle(Brand.secondary)
                        .padding(.top, 12)
                    Text("hidescore.com/privacy")
                        .font(.system(size: Type.caption, weight: .medium))
                        .foregroundStyle(Brand.secondary)
                }
                .frame(maxWidth: 1000, alignment: .leading)

                Button("Refresh now") {
                    Task { await model.load(day: model.day, force: true) }
                }
            }
            .padding(.horizontal, 70)
            .padding(.bottom, 70)
        }
        .background(Brand.background.ignoresSafeArea())
    }

    private func aboutRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(Brand.secondary)
            Spacer()
            Text(value)
        }
        .font(.system(size: Type.detail))
    }
}

extension Bundle {
    var versionSummary: String {
        let short = infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = infoDictionary?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }
}
