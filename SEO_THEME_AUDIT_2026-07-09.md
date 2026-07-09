# HideScore SEO Theme Audit - 2026-07-09

Scope: adjacent searches around "spoiler free sports", "no spoiler sports", "spoiler free scores", and "sports highlights without spoilers".

## Inputs

- Google Search Console screenshot from 2026-07-09:
  - `spoiler free scores`
  - `hide score`
  - `no spoiler sports`
  - `spoiler free sports`
- Live SERP competitor set:
  - spoilerfreesports.com
  - nospoilersports.app
  - dtmts.com
  - wikihoops.com
  - nospoilerz.com
  - nhlrecaps.net
- Current HideScore routes:
  - `/`
  - `/spoiler-free-sports`
  - `/today`
  - `/tomorrow`
  - `/yesterday`
  - `/faq`
  - `/worldcup`
  - `/worldcup/tomorrow`
  - `/worldcup/highlights`
  - `/watch-world-cup-without-spoilers`

## Findings

### P0 - Add `/watch-sports-highlights-without-spoilers`

Target queries:

- `watch sports highlights without spoilers`
- `sports highlights without spoilers`
- `watch highlights without spoilers`
- `spoiler free sports highlights`

Why it matters:

- This is the clearest commercial/user intent in competitor copy.
- Competitors lead with "Watch Sports Highlights Without Spoilers" and league lists.
- HideScore has the feature, but the current dedicated page is broader: `/spoiler-free-sports`.

Recommended page angle:

- Explain the YouTube thumbnail/title/score problem.
- Make HideScore's differentiator explicit: hidden score cards, neutral highlight access, ratings before reveal.
- Link to `/yesterday`, `/today`, `/spoiler-free-sports`, `/worldcup/highlights`.

### P0 - Add `/no-spoiler-scores`

Target queries:

- `no spoiler scores`
- `no spoiler sports scores`
- `scores without spoilers`
- `sports scores without spoilers`

Why it matters:

- GSC already shows `spoiler free scores` and `no spoiler sports`.
- `nospoilerscores.com` exists but is thin and external to the main domain's authority.
- The main HideScore domain should own a canonical exact-intent route too.

Recommended page angle:

- Hidden-by-default scoreboards.
- Today / yesterday / tomorrow use cases.
- Compare to normal ESPN/Google scoreboards without naming them too heavily.
- Link to `/today`, `/yesterday`, `/tomorrow`, `/faq`.

### P1 - Add `/nba-scores-without-spoilers`

Target queries:

- `nba scores no spoilers`
- `spoiler free nba scores`
- `nba highlights without spoilers`
- `nba game ratings`

Why it matters:

- Wikihoops ranks with an exact NBA H1: "Spoiler-Free NBA Scores, Recaps & Game Ratings".
- NBA is the clearest league-specific evergreen competitor gap.

Recommended page angle:

- NBA scores hidden until tap.
- Game ratings for deciding which replay/highlights to watch.
- Mention playoffs, regular season, yesterday's games, and top games.

### P1 - Add `/nhl-scores-without-spoilers`

Target queries:

- `nhl scores no spoilers`
- `spoiler free nhl scores`
- `nhl highlights without spoilers`
- `spoiler free nhl recaps`

Why it matters:

- HideScore's best social traction came from hockey.
- SERP has NHL-specific competitors such as nhlrecaps.net.
- Strong playoff/DVR fit.

Recommended page angle:

- NHL scores hidden by default.
- Recaps/highlights after reveal.
- Playoffs, overtime, and condensed game use cases.

### P2 - Add league highlight pages when seasonally useful

Targets:

- `/mlb-highlights-without-spoilers`
- `/nfl-highlights-without-spoilers`
- `/soccer-highlights-without-spoilers`

Status:

- Implement now per Jacob's priority: MLB, NFL, and soccer are more seasonally useful than waiting for more GSC volume.

Why initially lower priority:

- They are plausible but less proven by the current GSC screenshot.
- MLB and NFL should be timed around active season / playoffs.
- Soccer is partly covered by the World Cup pages right now.

## Recommended Order

1. `/watch-sports-highlights-without-spoilers`
2. `/no-spoiler-scores`
3. `/nba-scores-without-spoilers`
4. `/nhl-scores-without-spoilers`
5. Expand satellite domains only after the main-domain pages exist.

## Do Not Do

- Do not create 10 thin pages at once.
- Do not make near-duplicate pages for `spoiler free scores`, `no spoiler scores`, and `scores without spoilers`; one strong `/no-spoiler-scores` page is enough.
- Do not rely on keyword meta tags alone; visible H1/H2/body copy and internal links matter more.
- Do not point every page only at `/`; cross-link to the exact feature routes.
