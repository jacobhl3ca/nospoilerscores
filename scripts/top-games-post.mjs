#!/usr/bin/env node
// Weekly "games worth watching" post (Jacob 10/10). Renders the top games bake
// (news/top-games-<span>.json, the same files the Best column's span row reads)
// as text + a 1200×630 card, in two shapes:
//   all-sports  "5 games worth watching this week"
//   per league  "5 NFL games worth watching this week" (a league needs 3+ rated games)
//
// ⛔ Wording (Jacob 10/10): HideScore HIDES scores. Never "spoiler-free scores"
// or "scores without spoilers"; say "scores hidden", "spoiler-free highlights",
// "which games are worth watching". The list is ordered by the rating (how
// close the game was), and every line is "Away at Home": no score, no winner,
// no "beat". checkPost() fails the run if any of that slips in.
//
// Usage (laptop or mini; Node 22+, Playwright's Chromium for the card):
//   node scripts/top-games-post.mjs [--span=week] [--src=URL|DIR] [--out=DIR]
//        [--league=nfl,nhl] [--no-card] [--post-bluesky]
// Default source = the live bake on hidescore.com; default out =
// ~/hidescore-backlog/posts/<YYYY-MM-DD>/. --post-bluesky (off by default)
// posts the all-sports text + card with BSKY_HANDLE / BSKY_APP_PASSWORD; the
// first run (Oct 22) is posted by hand.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const top = await jiti.import("../src/lib/topGames.ts");
const espn = await jiti.import("../src/lib/espn.ts");

const argv = process.argv.slice(2);
const arg = (name, dflt) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? dflt;
const flag = (name) => argv.includes(`--${name}`);

export const POST_COUNT = 5;
const LEAGUE_MIN = 3;
const SITE = "https://hidescore.com";
const SPAN_WORDS = { yesterday: "from yesterday", week: "this week", month: "this month", year: "this year" };

// The four badge words the cards use (GameCard RatingBadge).
export function ratingWord(r) {
  return r >= 85 ? "Great" : r >= 70 ? "Good" : r >= 50 ? "Meh" : "Skip";
}

const teamName = (t) => t?.shortDisplayName || t?.displayName || t?.abbreviation || "";
export function matchup(game) {
  return `${teamName(game.awayTeam)} at ${teamName(game.homeTeam)}`;
}
const dayLabel = (iso) => new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
const leagueLabel = (game) => espn.sportDisplayLabel(game.sport, new Date(game.date));
const SHORT = (await jiti.import("../src/lib/leagueLabels.ts")).SHORT_LEAGUE_LABELS;
const leagueShort = (game) => { const l = leagueLabel(game); return SHORT[l] || l; };

// One post: the games, a title, the long text (newsletter / LinkedIn / Threads)
// and the short one (Bluesky / X, 300 characters).
export function buildPost(games, { span, league }) {
  const n = games.length;
  const what = league ? `${league} games` : "games";
  const title = `${n} ${what} worth watching ${SPAN_WORDS[span]}`;
  const lines = games.map((g, i) => `${i + 1}. ${matchup(g)}${league ? "" : ` · ${leagueShort(g)}`} · ${dayLabel(g.date)} · ${ratingWord(g.rating)}`);
  const text = [
    title,
    "Ranked by how close they were. Scores hidden.",
    "",
    ...lines,
    "",
    `Watch the highlights with the scores hidden: ${SITE}`,
  ].join("\n");
  const shortLines = games.map((g, i) => `${i + 1}. ${matchup(g)}${league ? "" : ` (${leagueShort(g)})`}`);
  let short = [title, "", ...shortLines, "", `Scores hidden: ${SITE.replace("https://", "")}`].join("\n");
  if ([...short].length > 300) short = [title, "", ...shortLines.slice(0, 3), "", SITE.replace("https://", "")].join("\n");
  return { title, games, text, short };
}

// The post must say nothing about a result. Fails on the banned phrase, a
// result word, a score-shaped pair, or any game's own score number anywhere
// outside its team names and dates ("76ers" is a name, not a score).
export function checkPost(post) {
  const problems = [];
  const all = `${post.text}\n${post.short}`;
  if (/spoiler[- ]free scores|scores without spoilers/i.test(all)) problems.push("banned phrase about scores");
  if (/\b(beat|beats|beaten|won|wins|defeat(s|ed)?|edged?|tops|topped|over)\b/i.test(all)) problems.push("a result word");
  if (/\b\d{1,3}\s*[-–:]\s*\d{1,3}\b/.test(all)) problems.push("a score-shaped number");
  let rest = all.replace(/^\d+\. /gm, "").split(post.title).join(" ");
  for (const g of post.games) rest = rest.split(matchup(g)).join(" ").split(dayLabel(g.date)).join(" ");
  for (const g of post.games) {
    for (const t of [g.homeTeam, g.awayTeam]) {
      const s = String(t?.score ?? "").trim();
      if (/^\d+$/.test(s) && new RegExp(`\\b${s}\\b`).test(rest)) problems.push(`score ${s} in the text`);
    }
  }
  return problems;
}

// The card: no logos, no scores. Rendered by Playwright's Chromium (a repo
// dev dependency, so no native canvas build).
export function cardHtml(post) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const tier = { Great: "#16a34a", Good: "#ca8a04", Meh: "#ea580c", Skip: "#b91c1c" };
  const rows = post.games.map((g, i) => {
    const w = ratingWord(g.rating);
    return `<li><span class="n">${i + 1}</span><span class="m">${esc(matchup(g))}</span><span class="l">${esc(leagueShort(g))}</span><span class="b" style="background:${tier[w]}">${w.toUpperCase()}</span></li>`;
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{width:1200px;height:630px;background:#0b1220;color:#f8fafc;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;padding:52px 64px;display:flex;flex-direction:column}
    h1{font-size:46px;font-weight:800;letter-spacing:-0.5px}
    .sub{font-size:22px;color:#94a3b8;margin-top:8px}
    ol{list-style:none;margin-top:30px;display:flex;flex-direction:column;gap:14px;flex:1}
    li{display:flex;align-items:center;gap:20px;background:#111a2e;border:1px solid #1e293b;border-radius:14px;padding:12px 22px;font-size:28px}
    .n{color:#64748b;font-weight:700;width:26px}
    .m{flex:1;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .l{color:#94a3b8;font-size:20px;font-weight:600}
    .b{font-size:18px;font-weight:800;color:#fff;border-radius:6px;padding:4px 10px}
    .f{display:flex;justify-content:space-between;font-size:22px;color:#94a3b8;margin-top:18px}
    .f b{color:#3b82f6}
  </style></head><body>
    <h1>${esc(post.title)}</h1>
    <div class="sub">Ranked by how close they were · scores hidden</div>
    <ol>${rows}</ol>
    <div class="f"><span><b>HideScore</b> · hidescore.com</span><span>Highlights, scores hidden</span></div>
  </body></html>`;
}

async function renderCards(posts) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    for (const { post, path } of posts) {
      await page.setContent(cardHtml(post), { waitUntil: "load" });
      await page.screenshot({ path, type: "png" });
    }
  } finally {
    await browser.close();
  }
}

async function loadSpan(src, span) {
  if (/^https?:/.test(src)) {
    const res = await fetch(`${src.replace(/\/$/, "")}/news/top-games-${span}.json?ts=${Date.now()}`);
    if (!res.ok) throw new Error(`top-games-${span}.json HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(await readFile(join(src, `top-games-${span}.json`), "utf8"));
}

// Bluesky: one post with the card attached. Only with --post-bluesky.
async function postBluesky(post, pngPath) {
  const handle = process.env.BSKY_HANDLE;
  const password = process.env.BSKY_APP_PASSWORD;
  if (!handle || !password) throw new Error("BSKY_HANDLE / BSKY_APP_PASSWORD not set");
  const pds = "https://bsky.social/xrpc";
  const session = await (await fetch(`${pds}/com.atproto.server.createSession`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: handle, password }),
  })).json();
  if (!session.accessJwt) throw new Error(`bluesky login failed: ${session.message || "no token"}`);
  const auth = { Authorization: `Bearer ${session.accessJwt}` };
  const blob = await (await fetch(`${pds}/com.atproto.repo.uploadBlob`, {
    method: "POST", headers: { ...auth, "Content-Type": "image/png" }, body: await readFile(pngPath),
  })).json();
  const text = post.short;
  const link = "hidescore.com";
  const start = Buffer.byteLength(text.slice(0, text.lastIndexOf(link)));
  const res = await fetch(`${pds}/com.atproto.repo.createRecord`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      repo: session.did, collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString(),
        facets: text.includes(link) ? [{ index: { byteStart: start, byteEnd: start + Buffer.byteLength(link) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: SITE }] }] : [],
        embed: { $type: "app.bsky.embed.images", images: [{ image: blob.blob, alt: `${post.title}: ${post.games.map(matchup).join(", ")}` }] },
      },
    }),
  });
  if (!res.ok) throw new Error(`bluesky post HTTP ${res.status}`);
  return (await res.json()).uri;
}

async function main() {
  const span = arg("span", "week");
  if (!top.isTopGamesSpan(span)) throw new Error(`--span must be one of ${top.TOP_GAMES_SPANS.join(", ")}`);
  const file = await loadSpan(arg("src", SITE), span);
  if (!top.isTopGamesFile(file)) throw new Error("not a top-games file");
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const out = arg("out", join(homedir(), "hidescore-backlog", "posts", date));
  await mkdir(out, { recursive: true });

  const wanted = arg("league", "").split(",").filter(Boolean);
  const posts = [{ key: "all-sports", post: buildPost(top.pickTopGames(file, null, POST_COUNT), { span }) }];
  for (const sport of Object.keys(file.leagues)) {
    if (wanted.length && !wanted.includes(sport)) continue;
    const games = top.pickTopGames(file, [sport], POST_COUNT);
    if (games.length < LEAGUE_MIN) continue;
    posts.push({ key: sport, post: buildPost(games, { span, league: leagueLabel(games[0]) }) });
  }

  const report = [];
  let bad = 0;
  for (const { key, post } of posts) {
    const problems = checkPost(post);
    if (problems.length) { bad++; console.error(`POST ${key}: ${problems.join("; ")}`); }
    await writeFile(join(out, `${key}.txt`), `${post.text}\n`);
    await writeFile(join(out, `${key}.short.txt`), `${post.short}\n`);
    report.push({ key, title: post.title, games: post.games.length, problems, card: `${key}.png`, short: [...post.short].length });
  }
  if (!flag("no-card")) await renderCards(posts.map(({ key, post }) => ({ post, path: join(out, `${key}.png`) })));
  await writeFile(join(out, "posts.json"), JSON.stringify({ span, from: file.from, to: file.to, generatedAt: new Date().toISOString(), posts: report }, null, 1));
  console.log(`TOP-GAMES-POST ${span} ${file.from}-${file.to} → ${out}: ${posts.length} posts (${posts.map((p) => `${p.key}:${p.post.games.length}`).join(" ")})`);
  if (bad) process.exit(2);

  if (flag("post-bluesky")) {
    const uri = await postBluesky(posts[0].post, join(out, "all-sports.png"));
    console.log(`BLUESKY posted ${uri}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e?.message || e); process.exit(1); });
}
