import Foundation

/// The worth-watching score, 0-100.
///
/// A direct port of `calculateRating` in `src/lib/espn.ts` — deliberately
/// line-for-line rather than "inspired by", because a TV that ranks last night's
/// games differently from the phone is worse than no ranking at all. Every
/// per-sport number it reads (multiplier, overtime bonus, scoring divisor,
/// regulation periods, period length, soccer flag, closeness curve) comes from
/// the catalog, so
/// recalibrating a sport is a website push, not an app update. Only the shape of
/// the algorithm lives here.
///
/// It is spoiler-safe on purpose: the output says how good a game was, never who
/// won or by how much.
enum Rating {

    struct LineScore {
        var value: Double = 0
        // Cricket only — ESPN gives every competitor a row per innings of the
        // match and flags the side that actually batted.
        var runs: Double?
        var wickets: Double?
        var overs: Double?
        var isBatting: Bool = false
    }

    struct Competitor {
        var score: Int?
        var lineScores: [LineScore] = []
    }

    struct Goal {
        var minute: Int      // stoppage folded in: 90'+5' → 95
        var sortKey: Double  // stoppage kept fractional: 45'+2' → 45.02
        var teamID: String
    }

    struct Input {
        var state: String            // "pre" | "in" | "post"
        var period: Int
        var clock: Double?
        var competitors: [Competitor]
        var goals: [Goal] = []       // soccer scoring plays, unsorted
    }

    static let fullMatchSeconds: Double = 5400

    // MARK: Entry point

    static func score(_ input: Input, config: Catalog.RatingConfig) -> Int? {
        if input.state == "pre" { return nil }
        guard input.competitors.count >= 2 else { return nil }
        if config.kind == "cricket" { return cricket(input) }

        guard let s1 = input.competitors[0].score, let s2 = input.competitors[1].score else { return nil }
        let diff = Double(abs(s1 - s2))
        let total = Double(s1 + s2)

        let progress = self.progress(input, config: config)

        // Insufficient-signal gate (~first 12%): a barely-started game has no
        // closeness signal — a 0-0 start would otherwise score a perfect 100
        // because every closeness factor falls back to "zero margin".
        if input.state == "in" && progress < 0.12 { return nil }

        // Factor 1 — final margin closeness (45%)
        let finalCloseness = closeness(diff, config: config)

        // Factor 2 — average margin across periods (35%): rewards a game that
        // was tight throughout even when the final margin is not.
        let runningMargin = self.runningMargin(input.competitors)
        let runningCloseness = runningMargin.map { closeness($0, config: config) } ?? finalCloseness

        // Factor 3 — margin entering the final period (20%)
        let fpMargin = self.finalPeriodMargin(input.competitors)
        let finalPeriodCloseness = fpMargin.map { closeness($0, config: config) } ?? finalCloseness

        let baseScore = finalCloseness * 0.45 + runningCloseness * 0.35 + finalPeriodCloseness * 0.20

        // Additive bonuses — these reward extras, they never penalize.
        let overtimeBonus = Double(input.period) > Double(config.regulationPeriods) ? config.overtimeBonus : 0
        let scoringBonus = min(total / config.scoringDivisor, 10)

        var comebackBonus: Double = 0
        if let fp = fpMargin, fp > diff {
            comebackBonus = min((fp - diff) * config.multiplier * 0.4, 30)
        }

        // Soccer: a goalless draw is the dull case no matter how "close" it
        // reads. 0 goals: -50, 1 goal: -25 — the website's numbers verbatim.
        // (1.0 shipped -10 for a 1-0, so every 1-0 rated 15 higher on the TV
        // than on the phone. The parity run is what caught it.)
        var lowScoringPenalty: Double = 0
        if config.soccer && total < 2 { lowScoringPenalty = (2 - total) * 25 }

        let lateDramaBonus = config.soccer ? soccerLateDrama(input.goals) : 0

        let raw = max(0, min(100, (baseScore + overtimeBonus + scoringBonus + comebackBonus
                                   + lateDramaBonus - lowScoringPenalty).rounded()))

        // Confidence cap: an early tie is close but that closeness hasn't held
        // up yet, so cap the reachable score by how much of the game has run.
        // A finished game (progress 1) is uncapped.
        let cap = (60 + 40 * progress).rounded()
        return Int(min(raw, cap))
    }

    // MARK: Progress

    /// Fraction of regulation elapsed, [0,1]. Uses the live clock where the sport
    /// has one so the "too early" gate trips *during* period 1 instead of at a
    /// flat period midpoint.
    static func progress(_ input: Input, config: Catalog.RatingConfig) -> Double {
        if input.state == "post" { return 1 }
        let clamp = { (x: Double) in max(0, min(1, x)) }
        let periods = Double(config.regulationPeriods)
        let coarse = clamp((Double(input.period) - 1 + 0.5) / periods)

        // Soccer's clock counts UP and equals total elapsed match seconds.
        if config.soccer {
            if let c = input.clock, c > 0 { return clamp(c / fullMatchSeconds) }
            return coarse
        }
        // Count-down sports: clock is seconds left in the current period.
        if let len = config.periodSeconds, len > 0, input.period >= 1, let c = input.clock {
            let periodFraction = clamp(1 - c / len)
            return clamp((Double(input.period) - 1 + periodFraction) / periods)
        }
        // Baseball and anything without a usable clock.
        return coarse
    }

    // MARK: Margin closeness

    /// Score margin → 0-100 "how close is this game", the shared input to all
    /// three closeness factors. A straight `multiplier` line for most sports.
    /// A sport whose points arrive in chunks (football: 3, 6, 7, 8) carries a
    /// piecewise-linear curve in the catalog keyed off how many SCORES the
    /// margin is worth, so a 7-0 game reads as "one score", not "seven points".
    /// Port of `marginCloseness` in src/lib/marginCloseness.ts.
    static func closeness(_ margin: Double, config: Catalog.RatingConfig) -> Double {
        let m = abs(margin)
        let raw: Double
        if let curve = config.closenessCurve, !curve.isEmpty {
            raw = alongCurve(m, curve)
        } else {
            raw = 100 - m * config.multiplier
        }
        return max(0, min(100, raw))
    }

    /// Linear interpolation along `[margin, closeness]` knots; flat outside
    /// either end.
    private static func alongCurve(_ margin: Double, _ curve: [[Double]]) -> Double {
        let knots = curve.filter { $0.count == 2 }
        guard let first = knots.first else { return 0 }
        if margin <= first[0] { return first[1] }
        for i in 1..<knots.count {
            let (x0, y0) = (knots[i - 1][0], knots[i - 1][1])
            let (x1, y1) = (knots[i][0], knots[i][1])
            if margin <= x1 { return y0 + ((margin - x0) / (x1 - x0)) * (y1 - y0) }
        }
        return knots[knots.count - 1][1]
    }

    // MARK: Margin helpers

    /// Average absolute margin across all periods. Needs at least two periods to
    /// mean anything.
    static func runningMargin(_ competitors: [Competitor]) -> Double? {
        let a = competitors[0].lineScores, b = competitors[1].lineScores
        let periods = min(a.count, b.count)
        if periods < 2 { return nil }
        var cumA: Double = 0, cumB: Double = 0, total: Double = 0
        for i in 0..<periods {
            cumA += a[i].value
            cumB += b[i].value
            total += abs(cumA - cumB)
        }
        return total / Double(periods)
    }

    /// Margin entering the final period.
    static func finalPeriodMargin(_ competitors: [Competitor]) -> Double? {
        let a = competitors[0].lineScores, b = competitors[1].lineScores
        let periods = min(a.count, b.count)
        if periods < 2 { return nil }
        var cumA: Double = 0, cumB: Double = 0
        for i in 0..<(periods - 1) {
            cumA += a[i].value
            cumB += b[i].value
        }
        return abs(cumA - cumB)
    }

    // MARK: Soccer late drama

    /// A result swung late — a stoppage-time winner is the most compelling
    /// soccer there is, and the closeness factors are blind to goal timing.
    /// Rewards the LATEST goal that changed who was ahead.
    static func soccerLateDrama(_ goals: [Goal]) -> Double {
        if goals.isEmpty { return 0 }
        let ordered = goals.sorted { $0.sortKey < $1.sortKey }
        var tally: [String: Int] = [:]
        var ids: [String] = []
        for g in ordered where !ids.contains(g.teamID) { ids.append(g.teamID) }

        func leader() -> String {
            if ids.count < 2 { return (tally[ids[0]] ?? 0) > 0 ? ids[0] : "tie" }
            let delta = (tally[ids[0]] ?? 0) - (tally[ids[1]] ?? 0)
            return delta == 0 ? "tie" : (delta > 0 ? ids[0] : ids[1])
        }

        var previous = "tie"
        var latestSwing = -1
        for g in ordered {
            tally[g.teamID, default: 0] += 1
            let now = leader()
            if now != previous { latestSwing = g.minute }
            previous = now
        }
        if latestSwing >= 90 { return 25 }
        if latestSwing >= 80 { return 16 }
        if latestSwing >= 70 { return 9 }
        return 0
    }

    /// Parses "67'", "45'+2'", "90'+5'". `minute` folds stoppage in for the
    /// lateness thresholds; `sortKey` keeps it fractional so goals stay in true
    /// chronological order across the half boundary.
    static func parseSoccerClock(_ display: String?) -> (minute: Int, sortKey: Double)? {
        guard let display else { return nil }
        var numbers: [Int] = []
        var digits = ""
        for ch in display {
            if ch.isNumber {
                digits.append(ch)
            } else if !digits.isEmpty {
                numbers.append(Int(digits) ?? 0)
                digits = ""
            }
        }
        if !digits.isEmpty { numbers.append(Int(digits) ?? 0) }
        guard let base = numbers.first else { return nil }
        let stoppage = numbers.count > 1 ? numbers[1] : 0
        return (base + stoppage, Double(base) + Double(stoppage) / 100)
    }

    // MARK: Cricket

    /// Limited-overs closeness. The generic scorer is actively misleading here:
    /// a chase ends the instant the target is passed, so the winner's total is
    /// always within a few runs of the loser's and every rout reads as a
    /// nail-biter. What matters is what the chasing side had LEFT.
    static func cricket(_ input: Input) -> Int? {
        guard let innings = cricketInnings(input.competitors) else { return nil }
        let first = innings.first, second = innings.second

        // Inferred from the first innings, not hardcoded to 20 overs, so the
        // same parser handles a 50-over match and a rain-shortened one.
        let allottedBalls = max(oversToBalls(first.overs), 1)

        let chaseWon = second.runs > first.runs
        let tied = second.runs == first.runs && input.state == "post"

        var closeness: Double
        if tied {
            closeness = 100                                   // Super Over
        } else if chaseWon {
            let wicketsInHand = max(0, 10 - second.wickets)
            let wicketCloseness = max(0, 100 - (wicketsInHand - 1) * 11)
            let ballsSpare = max(0, Double(allottedBalls) - Double(oversToBalls(second.overs)))
            let ballCloseness = max(0, 100 - (ballsSpare / Double(allottedBalls)) * 100)
            closeness = wicketCloseness * 0.55 + ballCloseness * 0.45
        } else if input.state == "post" {
            closeness = max(0, 100 - (first.runs - second.runs) * 2.2)
        } else {
            let ballsLeft = max(0, allottedBalls - oversToBalls(second.overs))
            if ballsLeft == 0 { return nil }
            let runsNeeded = first.runs + 1 - second.runs
            let required = (runsNeeded / Double(ballsLeft)) * 6
            closeness = max(0, 100 - abs(required - 9.5) * 14)
            if second.wickets >= 9 { closeness *= 0.5 }
        }

        let scoringBonus = min((first.runs + second.runs) / 45, 10)
        return Int(max(0, min(100, (closeness + scoringBonus).rounded())))
    }

    struct Innings { var runs: Double; var wickets: Double; var overs: Double }

    static func cricketInnings(_ competitors: [Competitor]) -> (first: Innings, second: Innings)? {
        var byPeriod: [Int: Innings] = [:]
        for c in competitors {
            for (i, row) in c.lineScores.enumerated() where row.isBatting {
                byPeriod[i + 1] = Innings(runs: row.runs ?? 0, wickets: row.wickets ?? 0, overs: row.overs ?? 0)
            }
        }
        guard let a = byPeriod[1], let b = byPeriod[2] else { return nil }
        return (a, b)
    }

    /// ESPN reports overs as a decimal whose fraction is BALLS, not tenths:
    /// 18.3 is 18 overs and 3 balls = 111 balls, not 18.5 overs.
    static func oversToBalls(_ overs: Double) -> Int {
        let whole = floor(overs)
        let balls = ((overs - whole) * 10).rounded()
        return Int(whole) * 6 + Int(min(balls, 5))
    }
}
