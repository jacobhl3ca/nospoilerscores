import Foundation

// Runs the tvOS rating port over the same fixture payloads the TypeScript
// harness scored. Compiled against the app's own Model sources — no copies — so
// any drift in the port is drift this run catches.
//
//   usage: parity-harness <fixtures-dir> <catalog.json>

let fixturesDir = URL(fileURLWithPath: CommandLine.arguments[1])
let catalog = try JSONDecoder().decode(Catalog.self,
                                       from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))

var rows: [[String: Any]] = []
let files = try FileManager.default
    .contentsOfDirectory(at: fixturesDir, includingPropertiesForKeys: nil)
    .filter { $0.pathExtension == "json" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }

for file in files {
    let key = String(file.deletingPathExtension().lastPathComponent.split(separator: "-")[0])
    guard let league = catalog.league(key) else { continue }
    guard let root = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any],
          let events = root["events"] as? [[String: Any]] else { continue }
    for event in events {
        guard let game = ESPN.parse(event, league: league) else { continue }
        rows.append(["league": key, "id": game.id, "rating": game.rating.map { $0 as Any } ?? NSNull()])
    }
}

FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: rows,
                                                           options: [.prettyPrinted, .sortedKeys]))
