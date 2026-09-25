// FotMob as a second source for the soccer `official` highlight slot (added
// 2026-09-23, PLAN-3 in ~/hidescore-soccer-audit-2026-09-19). Pure helpers
// behind the FotMob step of bakeGameHighlights() in scripts/prebake-news.mjs,
// kept here so tests/fotmob.test.mjs can load them without running the bake.
//
// Every FotMob page embeds its Next.js state in <script id="__NEXT_DATA__">.
//   League page  /leagues/<id>/overview/<slug>
//     → props.pageProps.fixtures.allMatches[] { id, pageUrl, home.name,
//       away.name, status.utcTime, status.finished }
//   Match page   pageUrl (the #<matchId> fragment is never sent)
//     → props.pageProps.content.matchFacts.highlights.url — the official
//       YouTube highlight FotMob links for THAT match.
// Probe 2026-09-20, last 6 finished games in 9 leagues: 36/48 linked, 0 wrong,
// and the 10 that overlapped the live manifest were the same video id. The
// signed /api/* JSON (x-mas header) is never used.
//
// FotMob's terms do not grant scraping, so the bake keeps it small: mini only
// (never GitHub Actions, the Worker or a user browser), a hard request budget,
// one request per second. See the FotMob step in the bake for the numbers.

// HideScore sport key → FotMob league id. UEL 73 verified 2026-09-23 (the page
// names "Europa League"). Ligue 1 linked 0/6 on the probe; it stays listed
// because a league page costs one request and only when a Ligue 1 game is
// still missing its official clip.
// The slug is cosmetic (any slug serves the same page); the canonical one is
// kept so the request looks like an ordinary page view.
export const FOTMOB_LEAGUES = {
  epl: { id: 47, slug: "premier-league" },
  laliga: { id: 87, slug: "laliga" },
  seriea: { id: 55, slug: "serie" },
  bundesliga: { id: 54, slug: "bundesliga" },
  ligue1: { id: 53, slug: "ligue-1" },
  mls: { id: 130, slug: "mls" },
  ligamx: { id: 230, slug: "liga-mx" },
  ucl: { id: 42, slug: "champions-league" },
  uel: { id: 73, slug: "europa-league" },
  efl: { id: 48, slug: "championship" },
  nwsl: { id: 9134, slug: "nwsl" },
};

export function fotmobLeaguePath(sport) {
  const league = FOTMOB_LEAGUES[sport];
  return league ? `/leagues/${league.id}/overview/${league.slug}` : null;
}

export function parseFotmobNextData(html) {
  const m = String(html ?? "").match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

// Finished fixtures from a league page, in FotMob's own shape reduced to what
// the matcher needs. Empty when the page has no fixture list.
export function fotmobFixtures(nextData) {
  const all = nextData?.props?.pageProps?.fixtures?.allMatches;
  if (!Array.isArray(all)) return [];
  const out = [];
  for (const m of all) {
    if (!m?.status?.finished || m.status.cancelled) continue;
    const path = String(m.pageUrl ?? "").split("#")[0];
    const utcMs = Date.parse(m.status.utcTime ?? "");
    if (!path.startsWith("/matches/") || !Number.isFinite(utcMs)) continue;
    const home = m.home?.name;
    const away = m.away?.name;
    if (!home || !away) continue;
    out.push({ id: String(m.id ?? ""), path, home, away, utcMs });
  }
  return out;
}

// The YouTube video id FotMob links on a match page, or null. Only a YouTube
// watch/short link counts — any other host is ignored. The `image` beside it is
// never read: a thumbnail can print the score.
export function fotmobHighlightVideoId(nextData) {
  const url = nextData?.props?.pageProps?.content?.matchFacts?.highlights?.url;
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    let id = null;
    if (host === "youtube.com") id = u.pathname === "/watch" ? u.searchParams.get("v") : (u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1] ?? null);
    else if (host === "youtu.be") id = u.pathname.slice(1);
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

// Letters NFKD leaves whole (ø is its own letter, not o + a mark), so
// "Bodø/Glimt" and ESPN's "Bodo/Glimt" would otherwise never meet.
const FOLD = { ø: "o", æ: "ae", œ: "oe", ß: "ss", ł: "l", đ: "d", ð: "d", þ: "th", ı: "i" };
// Club-form words that one side prints and the other drops ("Getafe CF",
// "Atlético de San Luis"). "Deportivo Alavés" keeps "deportivo" on purpose —
// see teamsMatch.
const CLUB_WORDS = new Set(["fc", "cf", "afc", "sc", "cd", "ud", "sd", "rc", "rcd", "ssc", "sv", "vfb", "vfl", "tsg", "fsv", "bv", "club", "and", "de"]);
// ESPN short name (key form) → FotMob's key, for pairs neither the word rule
// nor the worker's alias list bridges. Each one was a missed fixture on the
// 2026-09-23 dry run. Add more as HIGHLIGHT-FOTMOB-REJECT no-fixture lines
// turn up.
const NAME_ALIASES = {
  unam: "pumas",
  guadalajara: "chivas",
  "atl san luis": "atletico san luis",
  cologne: "koln",
  hamburg: "hamburger",
  "bayern munich": "bayern munchen",
  boro: "middlesbrough",
  "sheffield utd": "sheffield united",
  "union sg": "union st gilloise",
  psg: "paris saint germain",
};

export function fotmobTeamKey(name) {
  return String(name ?? "")
    .replace(/\s*\((?:w|women)\)\s*$/i, "")
    .toLowerCase()
    .replace(/[øæœßłđðþı]/g, (c) => FOLD[c])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !CLUB_WORDS.has(w))
    .join(" ");
}

// One ESPN name against one FotMob name. Equal keys match; otherwise every
// word of the shorter key must appear in the longer ("Alavés" ⊂ "Deportivo
// Alavés", "Brighton" ⊂ "Brighton & Hove Albion"). `variants` is the worker's
// alias list for the ESPN name ("nottm forest" → "nottingham forest"), tried
// the same way. Loose on purpose: a fixture must match BOTH teams inside a
// two-day window of ONE league, and the video is still title-checked.
export function teamsMatch(espnName, fotmobName, variants = []) {
  const b = fotmobTeamKey(fotmobName);
  if (!b) return false;
  const bw = b.split(" ");
  const alias = NAME_ALIASES[fotmobTeamKey(espnName)];
  return [espnName, ...variants, ...(alias ? [alias] : [])].some((name) => {
    const a = fotmobTeamKey(name);
    if (!a) return false;
    if (a === b) return true;
    const aw = a.split(" ");
    const [short, long] = aw.length <= bw.length ? [aw, bw] : [bw, aw];
    return short.every((w) => long.includes(w));
  });
}

// The finished FotMob fixture for one ESPN game: kickoff within a day either
// side (UTC vs ET date drift) and both teams matching, in either orientation.
// null when none or when two fixtures qualify — an ambiguous match is a miss.
export function findFotmobFixture(fixtures, { away, home, dateIso }, variantsOf = () => []) {
  const gameMs = Date.parse(dateIso ?? "");
  if (!Number.isFinite(gameMs)) return null;
  const awayVariants = variantsOf(away);
  const homeVariants = variantsOf(home);
  const hits = (fixtures ?? []).filter((f) => {
    if (Math.abs(f.utcMs - gameMs) > 86400000) return false;
    const straight = teamsMatch(home, f.home, homeVariants) && teamsMatch(away, f.away, awayVariants);
    const flipped = teamsMatch(home, f.away, homeVariants) && teamsMatch(away, f.home, awayVariants);
    return straight || flipped;
  });
  return hits.length === 1 ? hits[0] : null;
}

// A result score in a clip title: "GETAFE CF 1 - 0 MÁLAGA CF", "TOULOUSE FC -
// HAVRE AC (2-1)". Two 1–2 digit numbers around a dash, not part of a longer
// number, so "2026-27", "Matchday 4 – Bundesliga" and "26/27" stay clean.
export function titlePrintsScore(title) {
  return /(?<!\d)\d{1,2}\s*[-–—]\s*\d{1,2}(?!\d)/.test(String(title ?? ""));
}

// The gates every FotMob id must pass before it may fill the official slot.
// oEmbed first: a 401 there means the uploader turned embedding off (2 of 5
// EPL club clips on the probe). The uploader oEmbed reports becomes the slot's
// channel marker. oEmbed 200 is NOT enough on its own: every LALIGA EA SPORTS
// clip FotMob linked on 2026-09-23 passed oEmbed yet refuses to play embedded
// (the /embed shell says UNPLAYABLE, and the modal showed "can't play here").
//
// Until 2026-09-25 such a clip was rejected, because its hand-off opens
// YouTube, where LaLiga and Ligue 1 titles print the score. Jacob chose the NFL
// behaviour instead: keep the button, open straight on the "Watch on YouTube"
// card, and say on that card when the title shows the score. So an
// embed-blocked clip now passes if it plays on youtube.com from the mini (US) —
// `watchable` — and comes back flagged `embedBlocked`, with `titleScore` when
// its title prints a result. A TUDN Liga MX cut fails `watchable` (not
// available in the US at all) and is still rejected as "embed". An unknown
// embed verdict (null) is rejected as before. Returns { ok: true, channel,
// embedBlocked?, titleScore? } or { ok: false, reason }.
export async function gateFotmobVideo(videoId, { oembedMeta, embeddable, watchable, matchesTeams, matchesDate }) {
  const meta = await oembedMeta(videoId);
  if (!meta?.author) return { ok: false, reason: "oembed" };
  const embed = await embeddable(videoId);
  if (embed !== true && !(embed === false && watchable && (await watchable(videoId)) === true)) return { ok: false, reason: "embed" };
  if (!(await matchesTeams(videoId))) return { ok: false, reason: "teams" };
  if (!(await matchesDate(videoId))) return { ok: false, reason: "date" };
  if (embed === true) return { ok: true, channel: meta.author };
  return { ok: true, channel: meta.author, embedBlocked: true, ...(titlePrintsScore(meta.title) ? { titleScore: true } : {}) };
}
