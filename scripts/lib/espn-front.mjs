// ESPN front page day snapshot — the pure half of the "espn-front" bake in
// scripts/prebake-news.mjs. Kept out of the prebake so
// tests/espn-front-snapshot.test.ts can import it without running the bake.
//
// The ESPN front page column (src/lib/topEvents.ts) mirrors espn.com live, and
// espn.com keeps no history. So on a past date the column had nothing to show
// and the slot took its Auto league (Jacob 9/29: "filled NCAAF for me"). The
// mini samples the strip + body every 15 min and merges the samples into one
// file per day, public/news/espn-front/<YYYYMMDD>.json:
//
//   { date, fetchedAt, samples,
//     strip: { sports: [ { slug, leagues: [ { slug, events: [ { id } ] } ] } ] },
//     featured: ["401…", …] }
//
// `strip` is the header payload trimmed to the fields parseEspnHeader reads,
// so the slug → sport mapping stays in one place (HEADER_SLUG_TO_SPORT).
// `featured` is parseEspnFrontPageFeed's list (the homepage body's games).

// The day the board calls "today": the ET calendar day, rolled back before
// 1 AM like getEtServiceDate (src/lib/etDay.ts), so a game that runs past
// midnight is still sampled into the day the board shows it on.
export function etServiceYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const d = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  if (get("hour") % 24 < 1) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// The header payload → the stored strip. Tolerant like parseEspnHeader:
// unknown shapes are skipped, never thrown. Ids are strings.
export function trimEspnHeader(payload) {
  const out = { sports: [] };
  const sports = payload?.sports;
  if (!Array.isArray(sports)) return out;
  for (const s of sports) {
    const leagues = [];
    for (const lg of Array.isArray(s?.leagues) ? s.leagues : []) {
      if (typeof lg?.slug !== "string") continue;
      const events = [];
      for (const e of Array.isArray(lg.events) ? lg.events : []) {
        const id = e?.id;
        if ((typeof id === "string" || typeof id === "number") && !events.some((x) => x.id === String(id))) {
          events.push({ id: String(id) });
        }
      }
      if (events.length) leagues.push({ slug: lg.slug, events });
    }
    // Kept even with no leagues left: a sport's index is its strip position
    // (parseEspnHeader's sportOrder).
    out.sports.push({ slug: typeof s?.slug === "string" ? s.slug : "", leagues });
  }
  return out;
}

// The homepage body's game ids, top to bottom — the same reading as
// parseEspnFrontPageFeed in src/lib/topEvents.ts (a game block's
// `data.event.id`, then a scoreboard module's `SportingEvent` inlines).
export function parseFrontPageFeedIds(payload) {
  const out = [];
  const push = (id) => {
    if (typeof id !== "string" && typeof id !== "number") return;
    const s = String(id);
    if (s && !out.includes(s)) out.push(s);
  };
  const feed = payload?.feed;
  if (!Array.isArray(feed)) return out;
  for (const item of feed) {
    const data = item?.data;
    if (!data) continue;
    push(data.event?.id);
    for (const mod of Array.isArray(data.now) ? data.now : []) {
      for (const inl of Array.isArray(mod?.inlines) ? mod.inlines : []) {
        if (inl?.type === "SportingEvent") push(inl.eventId);
      }
    }
  }
  return out;
}

// Latest first, then what only the older list had, in its order.
function unionLatestFirst(latest, older, key) {
  const seen = new Set(latest.map(key));
  return [...latest, ...older.filter((x) => !seen.has(key(x)))];
}

// One more sample into the day's file. The latest sample's order leads; what
// an earlier sample saw and this one does not is kept at the END of its
// league (a 1 pm game that rolled off the strip by 11 pm must still show),
// and a league or sport that left the strip entirely goes after the rest.
// A `prev` from another day is ignored, so each day starts fresh.
export function mergeEspnFrontSnapshot(prev, sample) {
  const same = prev && prev.date === sample.date;
  const prevStrip = same && Array.isArray(prev.strip?.sports) ? prev.strip.sports : [];
  const prevFeatured = same && Array.isArray(prev.featured) ? prev.featured : [];
  const sportKey = (s) => s.slug || s.leagues.map((l) => l.slug).join(",");
  const sports = sample.strip.sports.map((s) => {
    const old = prevStrip.find((p) => sportKey(p) === sportKey(s));
    const leagues = s.leagues.map((lg) => {
      const oldLg = old?.leagues.find((l) => l.slug === lg.slug);
      return { slug: lg.slug, events: unionLatestFirst(lg.events, oldLg?.events ?? [], (e) => e.id) };
    });
    return { slug: s.slug, leagues: unionLatestFirst(leagues, old?.leagues ?? [], (l) => l.slug) };
  });
  return {
    date: sample.date,
    fetchedAt: sample.fetchedAt,
    samples: (same ? prev.samples ?? 0 : 0) + 1,
    strip: { sports: unionLatestFirst(sports, prevStrip, sportKey) },
    featured: unionLatestFirst(sample.featured ?? [], prevFeatured, (id) => id),
  };
}
