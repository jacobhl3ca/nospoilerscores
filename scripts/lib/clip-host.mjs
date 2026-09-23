// Host-agnostic goal-clip resolver helpers for r/soccer link posts.
//
// r/soccer bans direct uploads, so goal clips live on small video sites that
// rotate every few months (streamja → streamin → streamff → dropr → streama.in),
// and a known site can also move its CDN (streama.in: cdn.streamain.com →
// media.sportits.com, found 2026-09-22). Each change used to blank the soccer
// videos until someone wrote a new per-host resolver. These helpers read the
// clip out of ANY such page the way a browser player would, so the next
// rotation needs no code. Pure functions only; the fetching lives in
// prebake-news.mjs (fetchGenericClipMp4).

// Sites that are never a goal-clip page, even when a path looks like one.
// Streamable has its own API resolver; the rest are social / news / Reddit.
const NOT_CLIP_HOSTS =
  /(?:^|\.)(?:reddit\.com|redd\.it|youtube\.com|youtu\.be|streamable\.com|imgur\.com|x\.com|twitter\.com|bsky\.app|instagram\.com|tiktok\.com|facebook\.com|google\.com)$/i;

// The page shapes every clip host so far has used for one clip:
//   /v/<id> (streamff, streamin, dropr), /<id>/watch with an optional
//   /<lang>/ prefix (streama.in), /embed/<id>, /e/<id>, /watch/<id>.
const CLIP_PATH =
  /^\/(?:v\/[\w-]{4,40}|(?:[a-z]{2}\/)?[\w-]{6,40}\/watch|embed\/[\w-]{4,40}|e\/[\w-]{4,40}|watch\/[\w-]{4,40})\/?$/i;

// Known clip hosts whose links do not use one of the shapes above.
const KNOWN_CLIP_HOST = /^(?:streama\.in|streamain\.\w+)$/i;

export function isClipPageUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol) || NOT_CLIP_HOSTS.test(u.hostname)) return false;
  return KNOWN_CLIP_HOST.test(u.hostname) || CLIP_PATH.test(u.pathname);
}

function unescapeAttr(s) {
  return s.replace(/&amp;/g, "&").replace(/&#0*38;/g, "&").replace(/&quot;/g, '"');
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([^"']*)\\1`, "i"));
  return m ? unescapeAttr(m[2]) : null;
}

function absolute(u, base) {
  try {
    return new URL(u, base).href;
  } catch {
    return null;
  }
}

const MP4 = /\.mp4(?:$|[?#])/i;

// Read one clip page. Returns { mp4, thumb, embedUrl }, each null when absent.
//
// ⛔ Never take "the first .mp4 anywhere in the page": a streama.in watch page
// carries ~20 OTHER clips as sidebar previews (<a data-preview-src="….mp4">),
// so that picks a different goal. Only trust where a player puts ITS clip:
// the page's og:video meta, or the page's first <video> element.
export function parseClipPage(html, pageUrl) {
  const metas = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase();
    const content = attr(tag, "content");
    if (key && content && !(key in metas)) metas[key] = content;
  }
  let mp4 = null;
  for (const key of ["og:video:secure_url", "og:video:url", "og:video", "twitter:player:stream"]) {
    if (metas[key] && MP4.test(metas[key])) {
      mp4 = metas[key];
      break;
    }
  }
  if (!mp4) {
    const video = html.match(/<video\b[^>]*>[\s\S]*?(?:<\/video>|$)/i);
    if (video) {
      const open = video[0].match(/<video\b[^>]*>/i)[0];
      for (const name of ["src", "data-src", "data-link", "data-url", "data-video", "data-mp4"]) {
        const v = attr(open, name);
        if (v && MP4.test(v)) {
          mp4 = v;
          break;
        }
      }
      if (!mp4) {
        for (const s of video[0].match(/<source\b[^>]*>/gi) || []) {
          const v = attr(s, "src");
          if (v && MP4.test(v)) {
            mp4 = v;
            break;
          }
        }
      }
    }
  }
  const thumb = metas["og:image:secure_url"] || metas["og:image"] || metas["twitter:image"] || null;
  // A watch page with a JS player often wraps a server-rendered /embed/<id>.
  let embedUrl = null;
  for (const tag of html.match(/<iframe\b[^>]*>/gi) || []) {
    const src = attr(tag, "src");
    if (src && /\/embed\//i.test(src)) {
      embedUrl = absolute(src, pageUrl);
      break;
    }
  }
  return {
    mp4: mp4 ? absolute(mp4, pageUrl) : null,
    thumb: thumb ? absolute(thumb, pageUrl) : null,
    embedUrl,
  };
}
