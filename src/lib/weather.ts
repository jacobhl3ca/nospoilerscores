// Local venue weather for the game-detail modal. Uses two free, key-less,
// CORS-open Open-Meteo endpoints: geocode the venue city → lat/lon + timezone,
// then pull that day's hourly forecast. ESPN's summary endpoint only carries a
// single gametime snapshot (no hourly), so Open-Meteo drives both the gametime
// conditions and the rain-through-the-day timeline. Forecast horizon is ~15
// days — games further out just resolve to null (no weather shown).

export interface WeatherHour {
  hour24: number; // 0-23 local
  label: string; // "3 PM"
  rainPct: number; // 0-100
}

export interface GameWeather {
  tempF: number;
  icon: string; // emoji condition glyph
  label: string; // "Partly cloudy"
  rainPct: number; // gametime chance
  peakRainPct: number; // highest chance across the day's watch window
  peakLabel: string; // "2 PM"
  timeline: WeatherHour[]; // 9 AM–11 PM local, for the rain bar chart
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
  if (code <= 2) return { icon: "🌤️", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", label: "Cloudy" };
  if (code <= 48) return { icon: "🌫️", label: "Fog" };
  if (code <= 57) return { icon: "🌦️", label: "Drizzle" };
  if (code <= 67) return { icon: "🌧️", label: "Rain" };
  if (code <= 77) return { icon: "🌨️", label: "Snow" };
  if (code <= 82) return { icon: "🌧️", label: "Showers" };
  if (code <= 86) return { icon: "🌨️", label: "Snow showers" };
  return { icon: "⛈️", label: "Thunderstorm" }; // 95-99
}

function hourLabel(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
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
        geoCache.set(key, geo);
        return geo;
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
    if (r.ok) {
      const d = await r.json();
      const list: Array<{ latitude?: number; longitude?: number; admin1?: string; country?: string; timezone?: string }> =
        d.results ?? [];
      const reg = region.toLowerCase();
      // Disambiguate same-named cities by matching the venue's state/country
      // ("St. Louis, Missouri" → the Missouri hit, not PEI). Fall back to the
      // top result (Open-Meteo ranks by prominence).
      const pick =
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
// to ONE request, and reopening a game is instant.
const resultCache = new Map<string, Promise<GameWeather | null>>();

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
  if (hit) return hit;
  const p = computeWeather(venueLocation, gameDateISO).catch(() => null);
  resultCache.set(key, p);
  // Drop a null (failed/transient) so a later open can retry; keep real hits.
  p.then((w) => { if (w === null) resultCache.delete(key); });
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
  // when that result carried no timezone (see geocode's `?? "auto"`). "auto" is
  // valid for Open-Meteo's `timezone=` API param below, but NOT for Intl —
  // toLocale*({ timeZone: "auto" }) throws a RangeError, which (these calls sit
  // outside the try) would reject the whole forecast and silently drop weather
  // for the venue. Coerce it to the device zone so the intended graceful
  // fallback actually works; a real IANA tz is used unchanged.
  const tz = geo.tz && geo.tz !== "auto" ? geo.tz : undefined;
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

  let data: { hourly?: Record<string, unknown[]>; current?: Record<string, unknown>; error?: boolean };
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
      `&hourly=temperature_2m,precipitation_probability,weather_code` +
      `&current=temperature_2m,precipitation,weather_code` +
      `&temperature_unit=fahrenheit&timezone=${encodeURIComponent(apiTz)}&start_date=${localDate}&end_date=${localDate}`;
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
  let peakRainPct = 0;
  let peakLabel = "";
  for (let i = 0; i < times.length; i++) {
    const hr = parseInt(times[i].slice(11, 13), 10);
    if (!isNaN(localHour) && hr === localHour) gameIdx = i;
    if (hr >= 9 && hr <= 23) {
      const rp = Math.round(rains[i] ?? 0);
      timeline.push({ hour24: hr, label: hourLabel(hr), rainPct: rp });
      if (rp > peakRainPct) {
        peakRainPct = rp;
        peakLabel = hourLabel(hr);
      }
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
    peakRainPct,
    peakLabel,
    timeline,
    gameHour24: parseInt(times[gameIdx].slice(11, 13), 10),
    nowTempF: Math.round(typeof cur.temperature_2m === "number" ? cur.temperature_2m : (temps[gameIdx] ?? 0)),
    nowIcon: nowCond.icon,
    nowLabel: nowCond.label,
    rainingNow: nowPrecip > 0 || wetCode,
  };
}
