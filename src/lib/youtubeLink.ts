// YouTube link → video id, for /watch (paste any highlight link) and for
// openExternal's app handoff. One parser so the two can never disagree about
// what counts as a YouTube video link.
//
// Accepts youtu.be/ID, youtube.com/watch?v=ID (www., m., music.), /shorts/ID,
// /live/ID, /embed/ID (also youtube-nocookie.com), a bare 11-character id, and
// free text with a link inside it — a share sheet usually sends
// "Title https://youtu.be/…", not the bare URL. Anything else is null.

const ID_RX = /^[A-Za-z0-9_-]{11}$/;
// 11 id characters NOT followed by a 12th, so "ID." at the end of a sentence
// still reads but a 12-character path segment does not.
const ID_PREFIX_RX = /^([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;
const YT_HOSTS = new Set(["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"]);
// A YouTube link inside free text, with or without its scheme. The lookbehind
// keeps "notyoutube.com" and a youtube URL nested in another link's query out.
const YT_IN_TEXT_RX = /(?<![\w.\-/=?&%])(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/[^\s<>"']*/gi;

function idFromUrl(u: URL): string | null {
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") {
    const m = u.pathname.slice(1).match(ID_PREFIX_RX);
    return m ? m[1] : null;
  }
  if (!YT_HOSTS.has(host)) return null;
  if (u.pathname === "/watch") {
    const m = (u.searchParams.get("v") || "").match(ID_PREFIX_RX);
    return m ? m[1] : null;
  }
  const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m ? m[1] : null;
}

function tryUrl(s: string): URL | null {
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

export function parseYouTubeId(input: string | null | undefined): string | null {
  const s = (input || "").trim();
  if (!s) return null;
  if (ID_RX.test(s)) return s;
  // The whole input is one URL: judge that URL alone. Without this a Reddit or
  // Google redirect link that carries a youtu.be URL in its query would be
  // read as the YouTube video itself.
  if (/^https?:\/\/\S+$/i.test(s)) {
    const u = tryUrl(s);
    return u ? idFromUrl(u) : null;
  }
  for (const m of s.matchAll(YT_IN_TEXT_RX)) {
    const u = tryUrl(m[0].replace(/[)\].,!?;:]+$/, ""));
    const id = u && idFromUrl(u);
    if (id) return id;
  }
  return null;
}

// The /watch query → a video id. `v` and `url` are HideScore's own deep links;
// `text` and `title` are the Web Share Target field names (manifest.json) and
// what the Android share intent forwards. `raw` is the first value present, so
// the landing can show what failed to parse.
export function readWatchQuery(search: string): { id: string | null; raw: string | null } {
  const p = new URLSearchParams(search);
  let raw: string | null = null;
  for (const k of ["v", "url", "text", "title"]) {
    const val = p.get(k);
    if (!val) continue;
    raw ??= val;
    const id = parseYouTubeId(val);
    if (id) return { id, raw: val };
  }
  return { id: null, raw };
}
