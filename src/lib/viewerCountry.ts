// The viewer's country, for the per-country broadcaster chip on leagues ESPN
// lists no TV for (lib/rightsHolders.ts). Settings "Your country" wins; else
// the DEVICE time zone (never the IP, so a VPN does not move it, and no
// request). Pure and import-free: `node --test` loads it directly.

// IANA zone → ISO-2 country. Covers the zones a rugby viewer is likely to
// have; anything else returns "" and the chip says "Where to watch".
const ZONE_COUNTRY: Record<string, string> = {
  // United States
  "America/New_York": "US", "America/Detroit": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Phoenix": "US", "America/Los_Angeles": "US", "America/Anchorage": "US", "America/Juneau": "US",
  "America/Sitka": "US", "America/Nome": "US", "America/Adak": "US", "America/Boise": "US",
  "America/Menominee": "US", "America/Metlakatla": "US", "America/Yakutat": "US", "Pacific/Honolulu": "US",
  "America/Indianapolis": "US", "America/Louisville": "US",
  // Canada
  "America/Toronto": "CA", "America/Montreal": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA",
  "America/Winnipeg": "CA", "America/Regina": "CA", "America/Halifax": "CA", "America/St_Johns": "CA",
  "America/Moncton": "CA", "America/Glace_Bay": "CA", "America/Goose_Bay": "CA", "America/Whitehorse": "CA",
  "America/Yellowknife": "CA", "America/Iqaluit": "CA", "America/Swift_Current": "CA", "America/Dawson_Creek": "CA",
  "America/Fort_Nelson": "CA", "America/Rankin_Inlet": "CA", "America/Cambridge_Bay": "CA", "America/Inuvik": "CA",
  // Rest of the Americas
  "America/Mexico_City": "MX", "America/Monterrey": "MX", "America/Tijuana": "MX", "America/Cancun": "MX",
  "America/Sao_Paulo": "BR", "America/Bahia": "BR", "America/Fortaleza": "BR", "America/Recife": "BR",
  "America/Manaus": "BR", "America/Belem": "BR", "America/Cuiaba": "BR", "America/Campo_Grande": "BR",
  "America/Argentina/Buenos_Aires": "AR", "America/Buenos_Aires": "AR", "America/Argentina/Cordoba": "AR",
  "America/Santiago": "CL", "America/Montevideo": "UY", "America/Asuncion": "PY", "America/Lima": "PE",
  "America/Bogota": "CO", "America/Caracas": "VE", "America/Guayaquil": "EC", "America/La_Paz": "BO",
  "America/Puerto_Rico": "PR", "America/Jamaica": "JM", "America/Panama": "PA", "America/Costa_Rica": "CR",
  // Europe
  "Europe/London": "GB", "Europe/Belfast": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR",
  "Europe/Monaco": "MC", "Europe/Andorra": "AD", "Europe/Madrid": "ES", "Atlantic/Canary": "ES",
  "Europe/Lisbon": "PT", "Atlantic/Madeira": "PT", "Atlantic/Azores": "PT", "Europe/Rome": "IT",
  "Europe/San_Marino": "SM", "Europe/Vatican": "VA", "Europe/Malta": "MT", "Europe/Berlin": "DE",
  "Europe/Busingen": "DE", "Europe/Vienna": "AT", "Europe/Zurich": "CH", "Europe/Vaduz": "LI",
  "Europe/Luxembourg": "LU", "Europe/Brussels": "BE", "Europe/Amsterdam": "NL", "Europe/Copenhagen": "DK",
  "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Helsinki": "FI", "Atlantic/Reykjavik": "IS",
  "Europe/Tallinn": "EE", "Europe/Riga": "LV", "Europe/Vilnius": "LT", "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ", "Europe/Bratislava": "SK", "Europe/Budapest": "HU", "Europe/Ljubljana": "SI",
  "Europe/Zagreb": "HR", "Europe/Belgrade": "RS", "Europe/Sarajevo": "BA", "Europe/Podgorica": "ME",
  "Europe/Skopje": "MK", "Europe/Tirane": "AL", "Europe/Athens": "GR", "Europe/Sofia": "BG",
  "Europe/Bucharest": "RO", "Europe/Chisinau": "MD", "Europe/Kiev": "UA", "Europe/Kyiv": "UA",
  "Europe/Istanbul": "TR", "Asia/Nicosia": "CY", "Europe/Nicosia": "CY", "Asia/Tbilisi": "GE",
  "Europe/Gibraltar": "GI", "Europe/Guernsey": "GB", "Europe/Jersey": "GB", "Europe/Isle_of_Man": "GB",
  // Middle East + North Africa
  "Asia/Dubai": "AE", "Asia/Qatar": "QA", "Asia/Riyadh": "SA", "Asia/Kuwait": "KW", "Asia/Bahrain": "BH",
  "Asia/Muscat": "OM", "Asia/Amman": "JO", "Asia/Beirut": "LB", "Asia/Baghdad": "IQ", "Africa/Cairo": "EG",
  "Africa/Casablanca": "MA", "Africa/Algiers": "DZ", "Africa/Tunis": "TN", "Asia/Jerusalem": "IL",
  // Sub-Saharan Africa
  "Africa/Johannesburg": "ZA", "Africa/Windhoek": "NA", "Africa/Harare": "ZW", "Africa/Nairobi": "KE",
  "Africa/Lagos": "NG", "Africa/Accra": "GH",
  // Asia-Pacific
  "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK", "Asia/Singapore": "SG",
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Bangkok": "TH", "Asia/Manila": "PH", "Asia/Jakarta": "ID",
  "Asia/Kuala_Lumpur": "MY", "Asia/Taipei": "TW",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU", "Australia/Perth": "AU",
  "Australia/Adelaide": "AU", "Australia/Hobart": "AU", "Australia/Darwin": "AU", "Australia/Canberra": "AU",
  "Australia/Lord_Howe": "AU", "Australia/Broken_Hill": "AU",
  "Pacific/Auckland": "NZ", "Pacific/Chatham": "NZ", "Pacific/Fiji": "FJ", "Pacific/Apia": "WS",
  "Pacific/Tongatapu": "TO",
};

export function countryForTimeZone(zone: string): string {
  if (!zone) return "";
  if (ZONE_COUNTRY[zone]) return ZONE_COUNTRY[zone];
  // The many US-only sub-zones ("America/Indiana/Knox", "America/Kentucky/Monticello",
  // "America/North_Dakota/Center").
  if (/^America\/(Indiana|Kentucky|North_Dakota)\//.test(zone)) return "US";
  if (/^America\/Argentina\//.test(zone)) return "AR";
  if (/^Australia\//.test(zone)) return "AU";
  return "";
}

// Every country the zone table can return, for the Settings picker.
export const KNOWN_COUNTRIES: readonly string[] = [...new Set(Object.values(ZONE_COUNTRY))].sort();

function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; }
}

// The Settings override (Preferences.viewerCountry, ISO-2). Pushed in by
// loadPreferences()/savePreferences(), the same way the time zone is.
let override = "";
const listeners = new Set<() => void>();
export function setViewerCountryOverride(code: string | undefined): void {
  const next = /^[A-Z]{2}$/.test(code ?? "") ? code! : "";
  if (next === override) return;
  override = next;
  listeners.forEach((fn) => fn());
}

// Override, else the device zone's country, else "".
export function getViewerCountry(zone: string = deviceTimeZone()): string {
  return override || countryForTimeZone(zone);
}

// For useSyncExternalStore: a change of the Settings override re-renders the chips.
export function subscribeViewerCountry(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
