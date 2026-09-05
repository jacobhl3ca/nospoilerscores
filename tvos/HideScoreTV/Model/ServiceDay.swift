import Foundation

/// The calendar day the app treats as "today".
///
/// Matches `getEtServiceDate` on the website: the day does NOT roll over until
/// 1 AM local, so a game that runs past midnight stays on tonight's board
/// instead of jumping to "yesterday" while it is still on the screen.
enum ServiceDay {
    static func today(_ now: Date = Date(), calendar: Calendar = .current) -> Date {
        let start = calendar.startOfDay(for: now)
        let hour = calendar.component(.hour, from: now)
        return hour < 1 ? calendar.date(byAdding: .day, value: -1, to: start) ?? start : start
    }

    static func offset(_ days: Int, from day: Date, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: days, to: day) ?? day
    }

    /// ESPN's `dates=` parameter.
    static func ymd(_ day: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: day)
        return String(format: "%04d%02d%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// The inverse of `ymd`, for the day a deep link names.
    static func date(fromYMD ymd: String, calendar: Calendar = .current) -> Date? {
        guard ymd.count == 8, let n = Int(ymd) else { return nil }
        return calendar.date(from: DateComponents(year: n / 10000, month: (n / 100) % 100, day: n % 100))
    }

    static func title(_ day: Date, relativeTo today: Date, calendar: Calendar = .current) -> String {
        let diff = calendar.dateComponents([.day], from: today, to: day).day ?? 0
        switch diff {
        case 0: return "Today"
        case -1: return "Yesterday"
        case 1: return "Tomorrow"
        default:
            let f = DateFormatter()
            f.dateFormat = "EEEE, MMM d"
            return f.string(from: day)
        }
    }
}
