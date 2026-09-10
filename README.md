# HideScore

**Is this game worth watching? Find out without finding out who won.**

[hidescore.com](https://hidescore.com) · [iOS](https://apps.apple.com/app/id6766885311) · Apple TV

HideScore is a spoiler-free sports scoreboard. Scores, records and standings are hidden
by default. Every game instead carries a **1-5 watchability rating** derived from its live
play-by-play — lead changes, closeness, late drama — so you can decide what to watch
tonight, or skip a dull game, without learning the result.

## What it covers

40+ leagues and competitions — football, basketball, baseball, hockey, soccer, tennis,
golf, rugby, cricket, motorsport, fighting, chess and poker — with per-league settings,
spoiler-safe highlight links, and a sensitive-news filter.

## How it works

- `src/lib/espn.ts` — normalizes the upstream play-by-play feeds into one game model.
- Watchability rating — scored from game state only; nothing that reveals a winner is
  ever sent to the client for a game you have not chosen to reveal.
- Cloudflare Worker — proxies highlight lookups so a video title cannot leak a score.
- GitHub Actions — refreshes data on a schedule and runs an hourly improvement bot.

## Run it yourself

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # static export to ./out
```

Deploys as a static site (Cloudflare Pages) plus one Worker. The iOS/tvOS/Android apps are
Capacitor wrappers around the same build.

## Contributing

Issues and pull requests welcome — especially new leagues, new upstream feeds, and
better watchability heuristics. Built and maintained solo with Claude Code.

## License

MIT — see [LICENSE](LICENSE).
