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

async function geocode(city: string, region: string, signal?: AbortSignal): Promise<Geo | null> {
  const key = `${city}|${region}`.toLowerCase();
  const cached = geoCache.get(key);
  if (cached !== undefined) return cached;
  let result: Geo | null = null;
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`,
      { signal },
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
    return null; // aborted / network — don't cache a transient miss
  }
  geoCache.set(key, result);
  return result;
}

// venueLocation: "St. Louis, Missouri" / "Guadalajara, Mexico". gameDateISO is
// the UTC ISO start; we derive the venue-LOCAL date + hour to pick the right
// day and the gametime row.
export async function fetchGameWeather(
  venueLocation: string,
  gameDateISO: string,
  signal?: AbortSignal,
): Promise<GameWeather | null> {
  const [cityRaw, ...rest] = venueLocation.split(",");
  const city = (cityRaw ?? "").trim();
  const region = rest.join(",").trim();
  if (!city) return null;

  const geo = await geocode(city, region, signal);
  if (!geo) return null;

  const start = new Date(gameDateISO);
  if (isNaN(start.getTime())) return null;
  const localDate = start.toLocaleDateString("en-CA", { timeZone: geo.tz }); // YYYY-MM-DD
  const localHour = parseInt(
    start.toLocaleString("en-US", { timeZone: geo.tz, hour: "2-digit", hour12: false }).slice(0, 2),
    10,
  );

  let data: { hourly?: Record<string, unknown[]>; error?: boolean };
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
      `&hourly=temperature_2m,precipitation_probability,weather_code` +
      `&temperature_unit=fahrenheit&timezone=auto&start_date=${localDate}&end_date=${localDate}`;
    const r = await fetch(url, { signal });
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
  return {
    tempF: Math.round(temps[gameIdx] ?? 0),
    icon: cond.icon,
    label: cond.label,
    rainPct: Math.round(rains[gameIdx] ?? 0),
    peakRainPct,
    peakLabel,
    timeline,
  };
}
