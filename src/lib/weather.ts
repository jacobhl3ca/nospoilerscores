// Local venue weather for the game-detail modal. Uses two free, key-less,
// CORS-open Open-Meteo endpoints: geocode the venue city → lat/lon + timezone,
// then pull that day's hourly forecast. ESPN's summary endpoint only carries a
// single gametime snapshot (no hourly), so Open-Meteo drives both the gametime
// conditions and the rain-through-the-day timeline. Forecast horizon is ~15
// days — games further out just resolve to null (no weather shown).

export interface WeatherHour {
  hour24: number; // venue-local hour, 0-23; 24-47 for a late game's post-midnight tail (see the timeline build)
  label: string; // "3 PM"
  rainPct: number; // 0-100
}

export interface GameWeather {
  tempF: number;
  icon: string; // emoji condition glyph
  label: string; // "Partly cloudy"
  rainPct: number; // gametime chance
  timeline: WeatherHour[]; // every fetched hour of the venue-local day; the rain block windows this around gametime
  gameHour24: number; // venue-local start hour (0-23), for the game-time window
  // Live "right now" conditions at the venue (Open-Meteo `current` block). The
  // gametime fields above are the forecast frozen at first pitch, so a drizzle
  // that rolls in mid-game never shows there ("said no rain, then drizzling").
  // For an in-progress game the modal renders these instead.
  nowTempF: number;
  nowIcon: string; // live condition emoji
  nowLabel: string; // live condition label ("Drizzle")
  rainingNow: boolean; // measurable precip now, or a wet WMO code
}

interface Geo {
  lat: number;
  lon: number;
  tz: string;
}

// city|region → resolved coords (or null miss). Module-level so reopening the
// same matchup's modal doesn't re-geocode.
const geoCache = new Map<string, Geo | null>();

// WMO weather codes → a compact emoji + label. Ranges per Open-Meteo's docs.
function wmo(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "Clear" };
  // WMO 1 = "Mainly clear" — distinct from 2 = "Partly cloudy". Lumping 1 into
  // the code<=2 branch mislabeled a mostly-clear sky as "Partly cloudy".
  if (code === 1) return { icon: "🌤️", label: "Mainly clear" };
  if (code <= 2) return { icon: "🌤️", label: "Partly cloudy" };
  // WMO 3 = "Overcast" (fully clouded over) per Open-Meteo's docs — the one
  // label in this map that diverged from the cited source ("Cloudy" reads as
  // milder than a solid overcast). Aligns with the code-1/2 wording split above.
  if (code === 3) return { icon: "☁️", label: "Overcast" };
  if (code <= 48) return { icon: "🌫️", label: "Fog" };
  // WMO 51-55 = drizzle, but 56-57 = FREEZING drizzle and 66-67 = FREEZING rain
  // — a materially different call for an outdoor game (an ice glaze, not just
  // wet), so split them out instead of lumping into plain "Drizzle"/"Rain".
  if (code <= 55) return { icon: "🌦️", label: "Drizzle" };
  if (code <= 57) return { icon: "🌧️", label: "Freezing drizzle" };
  if (code <= 65) return { icon: "🌧️", label: "Rain" };
  if (code <= 67) return { icon: "🌧️", label: "Freezing rain" };
  if (code <= 77) return { icon: "🌨️", label: "Snow" };
  if (code <= 82) return { icon: "🌧️", label: "Showers" };
  if (code <= 86) return { icon: "🌨️", label: "Snow showers" };
  return { icon: "⛈️", label: "Thunderstorm" }; // 95-99
}

// The next calendar day of a YYYY-MM-DD string (UTC math, so a DST shift in the
// venue zone can't move it). Used to extend the forecast window one day past a
// late venue-local start so the rain timeline keeps its post-midnight tail.
function nextIsoDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function hourLabel(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
}

// A tz string safe to hand to Intl.DateTimeFormat({ timeZone }), or undefined
// (→ the device zone). The geocoder's "auto" sentinel AND any malformed IANA
// name both throw a RangeError from toLocale*({ timeZone }), so validate by
// construction — the same probe getTimeZone() in lib/etDay.ts uses on the stored
// zone override. A real IANA zone returns unchanged.
function usableTz(tz: string | undefined): string | undefined {
  if (!tz || tz === "auto") return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

async function geocode(city: string, region: string): Promise<Geo | null> {
  const key = `${city}|${region}`.toLowerCase();
  const cached = geoCache.get(key);
  if (cached !== undefined) return cached;
  // A venue's coordinates never change, so persist hits across sessions — after
  // the first geocode of a park it's a localStorage read, not a network hop.
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(`nss-geo:${key}`);
      if (stored) {
        const geo = JSON.parse(stored) as Geo;
        // Only trust a cached hit whose coordinates are real finite numbers.
        // The network path below validates lat/lon before it ever persists a
        // Geo, but a legacy build's differently-shaped entry (or a partial/
        // corrupt write) can still be valid JSON with missing/NaN coords. Left
        // untrusted it would flow straight into the forecast URL as
        // `latitude=undefined`, 400 the request, and — because geoCache then
        // holds the bad entry — silently kill weather for that venue all
        // session. Drop it and re-geocode instead.
        if (Number.isFinite(geo?.lat) && Number.isFinite(geo?.lon)) {
          geoCache.set(key, geo);
          return geo;
        }
        window.localStorage.removeItem(`nss-geo:${key}`);
      }
    } catch {
      /* ignore */
    }
  }
  let result: Geo | null = null;
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`,
    );
    // A non-2xx (429 rate-limit, 5xx spike) is as transient as a dropped
    // connection: bail like the network catch below WITHOUT caching, so the
    // next modal open re-geocodes. Falling through would cache null (result is
    // still null here) and the top-of-function `cached !== undefined` guard
    // would then return that null forever — one blip and the venue shows no
    // weather for the whole session, defeating fetchGameWeather's retry.
    if (!r.ok) return null;
    const d = await r.json();
    const list: Array<{ latitude?: number; longitude?: number; admin1?: string; country?: string; timezone?: string }> =
      d.results ?? [];
    const reg = region.toLowerCase();
    // Disambiguate same-named cities by matching the venue's state/country
    // ("St. Louis, Missouri" → the Missouri hit, not PEI). Prefer an EXACT
    // admin1/country match, then fall back to a substring match, then to the
    // top result (Open-Meteo ranks by prominence). The substring fallback is
    // deliberate — it lets a shorter ESPN region match a longer official name
    // ("Madrid" ⊆ "Community of Madrid") — but must not run first: as a bare
    // substring test it also false-matches a region that is a substring of a
    // DIFFERENT admin1 ("Kansas" ⊆ "Arkansas", "Mexico" ⊆ "New Mexico"), which
    // could geocode a venue to the wrong same-named city. Trying exact first
    // resolves those collisions to the right region while leaving the
    // shorter-⊆-longer case unchanged.
    const pick =
      (reg &&
        list.find(
          (x) =>
            (x.admin1 ?? "").toLowerCase() === reg ||
            (x.country ?? "").toLowerCase() === reg,
        )) ||
      (reg &&
        list.find(
          (x) =>
            (x.admin1 ?? "").toLowerCase().includes(reg) ||
            (x.country ?? "").toLowerCase().includes(reg),
        )) ||
      list[0];
    if (pick && typeof pick.latitude === "number" && typeof pick.longitude === "number") {
      result = { lat: pick.latitude, lon: pick.longitude, tz: pick.timezone ?? "auto" };
    }
  } catch {
    return null; // network — don't cache a transient miss
  }
  geoCache.set(key, result);
  if (result && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(`nss-geo:${key}`, JSON.stringify(result));
    } catch {
      /* ignore */
    }
  }
  return result;
}

// venueLocation|gameDateISO → in-flight-or-resolved forecast. Sharing the
// Promise means a prefetch (card hover/tap) and the modal's own fetch dedupe
// to ONE request, and reopening a game within the TTL is instant.
//
// Entries carry a timestamp and expire after WEATHER_TTL_MS: the forecast half
// is fine to hold, but GameWeather also carries LIVE "right now" conditions
// (nowTempF/nowIcon/nowLabel/rainingNow, the Open-Meteo `current` block) that
// the detail modal renders for in-progress games. A session-lifetime cache
// froze those at first fetch — a drizzle that rolled in mid-game never surfaced
// on reopen, the exact staleness the now-* fields exist to fix. A short TTL lets
// the next open refetch while still deduping the prefetch→open burst and keeping
// rapid reopens instant (multi-day-out forecasts barely move in 5 min anyway).
const WEATHER_TTL_MS = 5 * 60_000;
const resultCache = new Map<string, { at: number; p: Promise<GameWeather | null> }>();

// Warm the cache before the modal opens — call on card hover/pointerdown so the
// forecast is usually ready by the time the detail popup renders (kills the
// "weather pops in a beat late" delay). No-ops for games that won't show
// weather (finished, indoor, or no resolved location).
export function prefetchGameWeather(game: {
  venueLocation?: string;
  date: string;
  state: string;
  venueRoof?: "indoor" | "roof" | null;
}): void {
  if (game.state === "post" || game.venueRoof || !game.venueLocation) return;
  void fetchGameWeather(game.venueLocation, game.date);
}

// venueLocation: "St. Louis, Missouri" / "Guadalajara, Mexico". gameDateISO is
// the UTC ISO start; we derive the venue-LOCAL date + hour to pick the right
// day and the gametime row. Cached by venue+date.
export function fetchGameWeather(venueLocation: string, gameDateISO: string): Promise<GameWeather | null> {
  const key = `${venueLocation}|${gameDateISO}`;
  const hit = resultCache.get(key);
  if (hit && Date.now() - hit.at < WEATHER_TTL_MS) return hit.p;
  const p = computeWeather(venueLocation, gameDateISO).catch(() => null);
  resultCache.set(key, { at: Date.now(), p });
  // Drop a null (failed/transient) so a later open can retry; keep real hits.
  // Guard the delete on identity so a retry that already replaced this entry
  // isn't clobbered by the stale promise's late rejection.
  p.then((w) => { if (w === null && resultCache.get(key)?.p === p) resultCache.delete(key); });
  return p;
}

async function computeWeather(venueLocation: string, gameDateISO: string): Promise<GameWeather | null> {
  const [cityRaw, ...rest] = venueLocation.split(",");
  const city = (cityRaw ?? "").trim();
  const region = rest.join(",").trim();
  if (!city) return null;

  const geo = await geocode(city, region);
  if (!geo) return null;

  const start = new Date(gameDateISO);
  if (isNaN(start.getTime())) return null;
  // geo.tz is an IANA zone from the geocoder, but it can be the "auto" sentinel
  // when that result carried no timezone (see geocode's `?? "auto"`), and a hit
  // restored from localStorage can carry ANY malformed tz — geocode()'s cache
  // guard validates lat/lon but not tz, so a legacy/partial/corrupt write with
  // real coords but a bad zone flows straight through. "auto" is valid for
  // Open-Meteo's `timezone=` API param below, but NEITHER "auto" nor a bad IANA
  // name is valid for Intl — toLocale*({ timeZone }) throws a RangeError, which
  // (these calls sit outside the try) would reject the whole forecast and, since
  // geoCache/localStorage still hold the entry, silently drop weather for that
  // venue all session. usableTz probes the zone and coerces any unusable value to
  // the device zone so the intended graceful fallback works; a real IANA tz is
  // used unchanged.
  const tz = usableTz(geo.tz);
  // The hourly request must return times in the SAME zone `localDate` and
  // `localHour` (below) are computed in, or the `hr === localHour` gametime
  // match reads the wrong hour. `timezone=auto` resolves times in the venue's
  // lat/lon zone, which matches `tz` when the geocoder gave one — but in the
  // no-tz fallback `tz` is the device zone while `auto` would still be the
  // venue's, so the two disagreed: the gametime row landed on the wrong hour
  // (wrong temp/rain/condition), or the day shifted near midnight. Pin the API
  // to the same effective zone so both sides always agree; a real IANA tz keeps
  // the request byte-identical to before (geo.tz already equals the auto zone).
  const apiTz = tz ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
  const localDate = start.toLocaleDateString("en-CA", { timeZone: tz }); // YYYY-MM-DD
  // % 24 guards the "24" some ICU builds emit for midnight (same guard as
  // etDay/DateNav). Open-meteo's hourly times run 0–23, so an unguarded "24"
  // would never match `hr === localHour` below and lose the gametime row.
  const localHour = parseInt(
    start.toLocaleString("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).slice(0, 2),
    10,
  ) % 24;

  // A venue-local start late enough that play can cross midnight needs the NEXT
  // day's early hours in the timeline too, or the rain block (which the modal
  // windows to ±game-length around start) silently drops its post-midnight tail
  // — the late-game mirror of the early-morning case the timeline loop below
  // already fixes. weather.ts can't see the sport's game length, so extend the
  // fetch by one day on any evening start (≥ 19:00 venue-local); those next-day
  // rows carry hour24 ≥ 24 (see the loop) so the modal's numeric window still
  // catches them, while a daytime game's request stays byte-identical to before.
  const endDate = !isNaN(localHour) && localHour >= 19 ? nextIsoDate(localDate) : localDate;

  let data: { hourly?: Record<string, unknown[]>; current?: Record<string, unknown>; error?: boolean };
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
      `&hourly=temperature_2m,precipitation_probability,weather_code` +
      `&current=temperature_2m,precipitation,weather_code` +
      `&temperature_unit=fahrenheit&timezone=${encodeURIComponent(apiTz)}&start_date=${localDate}&end_date=${endDate}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    data = await r.json();
  } catch {
    return null;
  }
  const h = data?.hourly;
  if (!h || data.error || !Array.isArray(h.time) || !h.time.length) return null;

  const times = h.time as string[];
  const temps = (h.temperature_2m ?? []) as number[];
  const rains = (h.precipitation_probability ?? []) as number[];
  const codes = (h.weather_code ?? []) as number[];

  const timeline: WeatherHour[] = [];
  let gameIdx = -1;
  for (let i = 0; i < times.length; i++) {
    const day = times[i].slice(0, 10); // "YYYY-MM-DD"
    const hr = parseInt(times[i].slice(11, 13), 10);
    // Match the gametime row on BOTH date and hour, day 0 only: the late-start
    // fetch above returns two days, so the start hour appears twice and a bare
    // `hr === localHour` (keeping the last match) would land gameIdx on the wrong
    // day. Lexicographic YYYY-MM-DD compares chronologically.
    if (gameIdx < 0 && day === localDate && !isNaN(localHour) && hr === localHour) gameIdx = i;
    // Keep every fetched hour (0–23) rather than only 9 AM–11 PM. The consumer
    // (GameDetailModal's rainWindow) already slices this to ±1h around gametime,
    // so a 9-AM floor never trimmed a normal daytime/evening game — but it did
    // drop the gametime hours of an early-morning venue-local start (an Asian /
    // Australian cricket or soccer match shown to US users), silently hiding the
    // rain block for exactly the games it's meant to warn about. The `0–23`
    // bounds are a validity check on the parsed hour, not a trim: `times[i]` is
    // Open-Meteo's own ISO string ("2026-08-30T00:00"), whose HH field is
    // always "00".."23", so a well-formed entry always passes. What the guard
    // actually earns its keep on is a malformed timestamp — `parseInt` returns
    // NaN, and `NaN >= 0` is false — so a bad row can't push a garbage hour
    // into the timeline.
    if (hr >= 0 && hr <= 23) {
      const rp = Math.round(rains[i] ?? 0);
      // A next-day row (the evening-start extension above) carries hour24 = hr+24
      // (24–47) so it sorts after the same-day hours and the modal's numeric
      // window [start−1 → start+len+1] still selects the post-midnight tail;
      // hourLabel(hr) still reads "12 AM"/"1 AM" since it wraps mod 12.
      timeline.push({ hour24: day > localDate ? hr + 24 : hr, label: hourLabel(hr), rainPct: rp });
    }
  }
  if (gameIdx < 0) gameIdx = Math.min(Math.max(isNaN(localHour) ? 0 : localHour, 0), times.length - 1);

  const cond = wmo(codes[gameIdx] ?? 0);

  // Live conditions — prefer the `current` block; fall back to the gametime
  // forecast hour if it's ever missing. Wet WMO codes: 51-67 drizzle/rain,
  // 71-86 snow/showers, 95-99 thunderstorm.
  const cur = data.current ?? {};
  const nowCode = typeof cur.weather_code === "number" ? cur.weather_code : (codes[gameIdx] ?? 0);
  const nowCond = wmo(nowCode);
  const nowPrecip = typeof cur.precipitation === "number" ? cur.precipitation : 0;
  const wetCode = (nowCode >= 51 && nowCode <= 67) || (nowCode >= 71 && nowCode <= 86) || nowCode >= 95;

  return {
    tempF: Math.round(temps[gameIdx] ?? 0),
    icon: cond.icon,
    label: cond.label,
    rainPct: Math.round(rains[gameIdx] ?? 0),
    timeline,
    gameHour24: parseInt(times[gameIdx].slice(11, 13), 10),
    nowTempF: Math.round(typeof cur.temperature_2m === "number" ? cur.temperature_2m : (temps[gameIdx] ?? 0)),
    nowIcon: nowCond.icon,
    nowLabel: nowCond.label,
    rainingNow: nowPrecip > 0 || wetCode,
  };
}
