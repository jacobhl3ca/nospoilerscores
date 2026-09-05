import Foundation
import CoreGraphics
import CoreText
import ImageIO

/// One Top Shelf tile — the game card, as a bitmap.
///
/// CoreGraphics and CoreText only, no UIKit, so the same file renders on a Mac
/// for `tools/shelf/shelf.sh` and on the Apple TV inside the extension: what
/// the smoke tool writes to disk is what the shelf will show. Everything is
/// laid out in fractions of the tile height, so the system's tile size (asked
/// for at runtime, never hardcoded) can change without the design changing.
struct ShelfTile {
    struct Side {
        var name: String
        var abbreviation: String
        var colorHex: String?
        var logo: CGImage?
    }

    var league: String
    var status: String          // "Final" · "7:10 PM" · "Top 3rd"
    var isLive: Bool
    var played: Bool            // draw the hidden-score marker
    var away: Side
    var home: Side
    var badge: (label: String, hex: String)?
    var channel: String?

    /// Everything that changes the picture, for the on-disk cache key. Logo
    /// presence counts, logo bytes don't.
    var signature: String {
        [league, status, isLive ? "live" : "", played ? "played" : "",
         away.name, away.abbreviation, away.colorHex ?? "", away.logo == nil ? "" : "logo",
         home.name, home.abbreviation, home.colorHex ?? "", home.logo == nil ? "" : "logo",
         badge?.label ?? "", badge?.hex ?? "", channel ?? ""].joined(separator: "\u{1F}")
    }
}

enum ShelfRenderer {

    static func png(_ tile: ShelfTile, size: CGSize, scale: CGFloat) -> Data? {
        let w = size.width, h = size.height
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let ctx = CGContext(data: nil, width: Int(w * scale), height: Int(h * scale),
                                  bitsPerComponent: 8, bytesPerRow: 0, space: space,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        ctx.scaleBy(x: scale, y: scale)
        ctx.setShouldAntialias(true)
        ctx.interpolationQuality = .high
        let canvas = Canvas(ctx: ctx, width: w, height: h)

        // Surface — the app's card colour, with a little depth so a row of tiles
        // doesn't read as one flat slab.
        if let gradient = CGGradient(colorsSpace: space,
                                     colors: [rgb(0.14, 0.15, 0.19), rgb(0.08, 0.09, 0.11)] as CFArray,
                                     locations: [0, 1]) {
            ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: h), end: CGPoint(x: 0, y: 0), options: [])
        }

        let pad = h * 0.075
        let white = rgb(1, 1, 1)
        let secondary = rgba(1, 1, 1, 0.62)
        let live = rgb(0.94, 0.31, 0.31)

        // Top row: league tag left, status right.
        let tagFont = font(h * 0.056, weight: .heavy)
        canvas.text(tile.league.uppercased(), font: tagFont, color: secondary, kern: h * 0.004,
                    x: pad, top: pad, maxWidth: w * 0.5)
        var right = w - pad
        let statusFont = font(h * 0.056, weight: .semibold)
        if tile.isLive {
            if !tile.status.isEmpty {
                let width = canvas.text(tile.status, font: statusFont, color: secondary,
                                        x: right, top: pad, maxWidth: w * 0.3, align: .right)
                right -= width + h * 0.03
            }
            let liveFont = font(h * 0.056, weight: .heavy)
            let width = canvas.text("LIVE", font: liveFont, color: live, x: right, top: pad, maxWidth: w * 0.2, align: .right)
            right -= width + h * 0.028
            let dot = h * 0.024
            let capMid = pad + CTFontGetCapHeight(liveFont) / 2 + (CTFontGetAscent(liveFont) - CTFontGetCapHeight(liveFont))
            ctx.setFillColor(live)
            ctx.fillEllipse(in: CGRect(x: right - dot, y: h - capMid - dot / 2, width: dot, height: dot))
        } else {
            canvas.text(tile.status, font: statusFont, color: secondary, x: right, top: pad, maxWidth: w * 0.4, align: .right)
        }

        // Hairline under the header.
        let dividerY = pad + h * 0.095
        ctx.setStrokeColor(rgba(1, 1, 1, 0.10))
        ctx.setLineWidth(max(1, h * 0.003))
        ctx.move(to: CGPoint(x: pad, y: h - dividerY))
        ctx.addLine(to: CGPoint(x: w - pad, y: h - dividerY))
        ctx.strokePath()

        // Bottom row: badge left, channel right.
        let bottomHeight = h * 0.125
        let bottomTop = h - pad - bottomHeight
        var bottomRight = w - pad
        if let channel = tile.channel, !channel.isEmpty {
            let channelFont = font(h * 0.054, weight: .medium)
            let top = bottomTop + (bottomHeight - CTFontGetCapHeight(channelFont)) / 2 - (CTFontGetAscent(channelFont) - CTFontGetCapHeight(channelFont))
            let width = canvas.text(channel, font: channelFont, color: secondary, x: bottomRight, top: top, maxWidth: w * 0.42, align: .right)
            bottomRight -= width + h * 0.04
        }
        if let badge = tile.badge {
            let badgeFont = font(h * 0.06, weight: .heavy)
            let textWidth = canvas.measure(badge.label, font: badgeFont, kern: h * 0.002)
            let capsule = CGRect(x: pad, y: h - bottomTop - bottomHeight, width: textWidth + h * 0.11, height: bottomHeight)
            ctx.setFillColor(color(hex: badge.hex) ?? rgb(0.4, 0.4, 0.4))
            ctx.addPath(CGPath(roundedRect: capsule, cornerWidth: bottomHeight / 2, cornerHeight: bottomHeight / 2, transform: nil))
            ctx.fillPath()
            let top = bottomTop + (bottomHeight - CTFontGetCapHeight(badgeFont)) / 2 - (CTFontGetAscent(badgeFont) - CTFontGetCapHeight(badgeFont))
            canvas.text(badge.label, font: badgeFont, color: white, kern: h * 0.002, x: pad + h * 0.055, top: top, maxWidth: textWidth + 2)
        }

        // Team rows fill the band between the hairline and the bottom row.
        let bandTop = dividerY + h * 0.035
        let bandBottom = bottomTop - h * 0.035
        let rowHeight = (bandBottom - bandTop) / 2
        let mark = min(rowHeight * 0.82, h * 0.2)
        let nameFont = font(h * 0.118, weight: .semibold)
        let markerFont = font(h * 0.11, weight: .heavy)
        let markerWidth = tile.played ? canvas.measure("•••", font: markerFont) : 0
        for (index, side) in [tile.away, tile.home].enumerated() {
            let rowTop = bandTop + rowHeight * CGFloat(index)
            let centre = rowTop + rowHeight / 2
            let circle = CGRect(x: pad, y: h - centre - mark / 2, width: mark, height: mark)
            canvas.teamMark(side, in: circle)
            let nameX = pad + mark + h * 0.04
            let nameRight = w - pad - (tile.played ? markerWidth + h * 0.04 : 0)
            let nameTop = centre - CTFontGetCapHeight(nameFont) / 2 - (CTFontGetAscent(nameFont) - CTFontGetCapHeight(nameFont))
            canvas.text(side.name, font: nameFont, color: white, x: nameX, top: nameTop,
                        maxWidth: nameRight - nameX, shrinkTo: 0.72)
            if tile.played {
                let markerTop = centre - CTFontGetCapHeight(markerFont) / 2 - (CTFontGetAscent(markerFont) - CTFontGetCapHeight(markerFont))
                canvas.text("•••", font: markerFont, color: secondary, x: w - pad, top: markerTop, maxWidth: markerWidth + 2, align: .right)
            }
        }

        guard let image = ctx.makeImage() else { return nil }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, "public.png" as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return data as Data
    }

    // MARK: - Drawing helpers

    /// Draws in a top-left coordinate system on a bottom-left CoreGraphics
    /// context, so the layout code above can think the way the SwiftUI views do.
    struct Canvas {
        let ctx: CGContext
        let width: CGFloat
        let height: CGFloat

        enum Align { case left, right }

        /// Draws one line of text and returns its drawn width. Shrinks down to
        /// `shrinkTo` × the size before truncating with an ellipsis.
        @discardableResult
        func text(_ string: String, font: CTFont, color: CGColor, kern: CGFloat = 0,
                  x: CGFloat, top: CGFloat, maxWidth: CGFloat, align: Align = .left,
                  shrinkTo: CGFloat = 1) -> CGFloat {
            var font = font
            var line = makeLine(string, font: font, color: color, kern: kern)
            var lineWidth = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
            if lineWidth > maxWidth && shrinkTo < 1 {
                let size = CTFontGetSize(font)
                let fitted = max(size * shrinkTo, size * maxWidth / lineWidth)
                font = CTFontCreateCopyWithAttributes(font, fitted, nil, nil)
                line = makeLine(string, font: font, color: color, kern: kern)
                lineWidth = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
            }
            if lineWidth > maxWidth {
                if let truncated = CTLineCreateTruncatedLine(line, Double(maxWidth), .end, nil) {
                    line = truncated
                    lineWidth = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
                }
            }
            let baseline = height - top - CTFontGetAscent(font)
            ctx.textMatrix = .identity
            ctx.textPosition = CGPoint(x: align == .left ? x : x - lineWidth, y: baseline)
            CTLineDraw(line, ctx)
            return lineWidth
        }

        func measure(_ string: String, font: CTFont, kern: CGFloat = 0) -> CGFloat {
            CGFloat(CTLineGetTypographicBounds(makeLine(string, font: font, color: rgb(1, 1, 1), kern: kern), nil, nil, nil))
        }

        private func makeLine(_ string: String, font: CTFont, color: CGColor, kern: CGFloat) -> CTLine {
            let attributes: [CFString: Any] = [
                kCTFontAttributeName: font,
                kCTForegroundColorAttributeName: color,
                kCTKernAttributeName: kern as CFNumber,
            ]
            let attributed = CFAttributedStringCreate(nil, string as CFString, attributes as CFDictionary)!
            return CTLineCreateWithAttributedString(attributed)
        }

        /// The team's logo in a soft circle, or its initials in its own colour
        /// when there is no logo to draw — the same fallback as the app's cards.
        func teamMark(_ side: ShelfTile.Side, in circle: CGRect) {
            ctx.saveGState()
            ctx.setFillColor(rgba(1, 1, 1, 0.10))
            ctx.fillEllipse(in: circle)
            if let logo = side.logo {
                ctx.addEllipse(in: circle)
                ctx.clip()
                let inset = circle.insetBy(dx: circle.width * 0.14, dy: circle.height * 0.14)
                let aspect = CGFloat(logo.width) / CGFloat(max(logo.height, 1))
                var rect = inset
                if aspect > 1 {
                    rect.size.height = inset.width / aspect
                    rect.origin.y = inset.midY - rect.height / 2
                } else {
                    rect.size.width = inset.height * aspect
                    rect.origin.x = inset.midX - rect.width / 2
                }
                ctx.draw(logo, in: rect)
            } else {
                let initials = String(side.abbreviation.prefix(3))
                let initialsFont = ShelfRenderer.font(circle.height * 0.34, weight: .bold)
                let width = measure(initials, font: initialsFont)
                let top = (height - circle.maxY) + (circle.height - CTFontGetCapHeight(initialsFont)) / 2
                    - (CTFontGetAscent(initialsFont) - CTFontGetCapHeight(initialsFont))
                text(initials, font: initialsFont, color: ShelfRenderer.color(hex: side.colorHex) ?? rgb(1, 1, 1),
                     x: circle.midX - width / 2, top: top, maxWidth: circle.width)
            }
            ctx.restoreGState()
        }
    }

    // MARK: - Fonts and colours

    enum Weight: CGFloat {
        case regular = 0, medium = 0.23, semibold = 0.3, bold = 0.4, heavy = 0.56
    }

    /// The system font at a weight, by descriptor rather than by name — so it is
    /// San Francisco on the Apple TV and on the Mac that renders the smoke test.
    static func font(_ size: CGFloat, weight: Weight) -> CTFont {
        let system = CTFontCreateUIFontForLanguage(.system, size, nil)
        let family = system.map { CTFontCopyFamilyName($0) as String } ?? "Helvetica Neue"
        let traits: [CFString: Any] = [kCTFontWeightTrait: weight.rawValue]
        let attributes: [CFString: Any] = [kCTFontFamilyNameAttribute: family, kCTFontTraitsAttribute: traits]
        let descriptor = CTFontDescriptorCreateWithAttributes(attributes as CFDictionary)
        return CTFontCreateWithFontDescriptor(descriptor, size, nil)
    }

    static func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> CGColor { rgba(r, g, b, 1) }

    static func rgba(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat) -> CGColor {
        CGColor(colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!, components: [r, g, b, a])!
    }

    static func color(hex: String?) -> CGColor? {
        guard var hex, !hex.isEmpty else { return nil }
        if hex.hasPrefix("#") { hex.removeFirst() }
        guard hex.count == 6, let value = Int(hex, radix: 16) else { return nil }
        return rgb(CGFloat((value >> 16) & 0xFF) / 255, CGFloat((value >> 8) & 0xFF) / 255, CGFloat(value & 0xFF) / 255)
    }
}

// MARK: - From a game to a tile

enum ShelfTiles {
    /// Builds the tile for a game. `logos` is keyed by logo URL; a missing entry
    /// falls back to initials.
    static func tile(for game: Game, catalog: Catalog, showRatings: Bool, logos: [String: CGImage]) -> ShelfTile {
        func side(_ team: GameTeam) -> ShelfTile.Side {
            ShelfTile.Side(name: team.shortName, abbreviation: team.abbreviation, colorHex: team.color,
                           logo: team.logo.flatMap { logos[$0] })
        }
        let status: String
        if game.isLive {
            status = game.statusDetail
        } else if game.isFinal {
            // "Final" and nothing more — ESPN's "Final/OT" leaks that it went long.
            status = "Final"
        } else {
            status = game.start?.clockTime() ?? game.statusDetail
        }
        var badge: (String, String)?
        if showRatings, game.isFinal || game.isLive, let rating = game.rating, let tier = catalog.tier(for: rating) {
            badge = (tier.label, tier.color)
        }
        return ShelfTile(league: game.leagueLabel, status: status, isLive: game.isLive,
                         played: game.state != "pre", away: side(game.away), home: side(game.home),
                         badge: badge, channel: game.broadcasts.first)
    }

    /// Fetches every distinct logo the games need, in parallel, each on a short
    /// leash — a slow CDN costs a logo, never the shelf.
    static func logos(for games: [Game], timeout: TimeInterval = 3) async -> [String: CGImage] {
        var urls = Set<String>()
        for game in games {
            if let a = game.away.logo { urls.insert(a) }
            if let h = game.home.logo { urls.insert(h) }
        }
        return await withTaskGroup(of: (String, CGImage?).self) { group -> [String: CGImage] in
            for urlString in urls {
                group.addTask {
                    guard let url = URL(string: urlString) else { return (urlString, nil) }
                    let image = try? await withTimeout(timeout) { () -> CGImage? in
                        let (data, response) = try await URLSession.shared.data(from: url)
                        guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
                        return decode(data)
                    }
                    return (urlString, image ?? nil)
                }
            }
            var out: [String: CGImage] = [:]
            for await (key, image) in group {
                if let image { out[key] = image }
            }
            return out
        }
    }

    /// Decodes at thumbnail size: a 500px ESPN logo is drawn ~100pt wide, and an
    /// extension has a small memory budget.
    static func decode(_ data: Data) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: 256,
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}

extension Date {
    func clockTime() -> String {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f.string(from: self)
    }
}

// MARK: - On-disk tile cache

/// Rendered tiles, in the app group container. The Top Shelf is drawn by the
/// system, which can read the group container but not the extension's own tmp.
struct ShelfImageStore {
    let directory: URL

    init(directory: URL) {
        self.directory = directory
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    /// The file for a tile at a size and scale, rendering it if it isn't there.
    func url(for tile: ShelfTile, key: String, size: CGSize, scale: CGFloat) -> URL? {
        let stamp = "\(key)|\(tile.signature)|\(Int(size.width))x\(Int(size.height))@\(Int(scale))"
        let url = directory.appendingPathComponent("\(Self.fnv1a(stamp))@\(Int(scale))x.png")
        if FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path)
            return url
        }
        guard let data = ShelfRenderer.png(tile, size: size, scale: scale) else { return nil }
        do { try data.write(to: url, options: .atomic) } catch { return nil }
        return url
    }

    /// Drops tiles nothing has asked for in two days.
    func prune(olderThan age: TimeInterval = 2 * 86_400) {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        for file in files {
            let modified = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
            if Date().timeIntervalSince(modified) > age { try? fm.removeItem(at: file) }
        }
    }

    /// Stable across processes, unlike `Hasher`, which is seeded per launch.
    static func fnv1a(_ string: String) -> String {
        var hash: UInt64 = 0xcbf29ce484222325
        for byte in string.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x100000001b3
        }
        return String(hash, radix: 16)
    }
}
