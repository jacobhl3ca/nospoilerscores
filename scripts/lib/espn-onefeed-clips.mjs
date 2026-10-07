// ESPN Videos card: the per-game "Top videos" strip and the homepage module
// clips, read from the oneFeed JSON (the ESPN front page feed the client and
// the espn-front bake already fetch). Jacob 10/7: these belong in the same
// ESPN Videos card, one card per game, every clip ESPN lists for that game.
//
// Two places carry a clip:
//   • a game block: feed[].data.event.videos[] (the strip under a game on
//     espn.com, in ESPN's order), with the same clips repeated as nested
//     Media inlines;
//   • a homepage module ("The air up there", "Must-see between the lines"):
//     nested Media inlines whose video[0] is the clip.
// Each video carries its own mp4 (links.source.HD.href on akamaized), length,
// publish time and ESPN's clip type (tracking.coverageType), so a clip here
// costs no clip-API request and the #278 talk filter runs on the feed itself.
//
// Pure: the caller fetches the feed and passes the title guards in (the
// VIDEO_BLOCKLIST and analyst-take rules live in prebake-news.mjs), so the
// unit test and the bake share one rule.

import { espnVideoMp4, isEspnTalkKind } from "./espn-clip.mjs";
import { isRealEspnClip } from "./video-order.mjs";

const RECAP_KIND_RX = /^final\s*game\s*highlights?$/i;

function str(v) {
  return typeof v === "string" ? v.trim() : "";
}

// One clip in the item's `clips[]` shape, or null when the card must not show
// it: talk (Analysis, PressConference, …), premium, expired, no akamaized mp4,
// not a real clip id, or a headline the title guards reject.
function toClip(video, nowMs, titleOk) {
  if (!video || typeof video !== "object") return null;
  const id = video.id != null ? String(video.id) : "";
  const headline = str(video.headline) || str(video.title);
  if (!id || !headline) return null;
  if (video.premium === true) return null;
  if (isEspnTalkKind(video.tracking?.coverageType)) return null;
  const expires = Date.parse(video.timeRestrictions?.expirationDate ?? "");
  if (Number.isFinite(expires) && expires <= nowMs) return null;
  const videoUrl = espnVideoMp4(video);
  if (!videoUrl) return null;
  if (!isRealEspnClip({ id, headline })) return null;
  if (!titleOk(headline)) return null;
  const sec = Number(video.duration);
  const poster = str(video.posterImages?.default?.href) || str(video.thumbnail) || str(video.images?.[0]?.url);
  return {
    id,
    headline,
    videoUrl,
    imageUrl: poster || null,
    durationSec: Number.isFinite(sec) && sec > 0 ? Math.round(sec) : null,
    published: str(video.originalPublishDate) || str(video.lastModified),
    kind: str(video.tracking?.coverageType),
  };
}

// Every Media inline with a video under `node`, depth first, in feed order.
function collectMedia(node, out) {
  if (Array.isArray(node)) {
    for (const n of node) collectMedia(n, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  if (node.type === "Media" && Array.isArray(node.video) && node.video[0]) {
    out.push(node.video[0]);
    return out;
  }
  if (Array.isArray(node.inlines)) collectMedia(node.inlines, out);
  return out;
}

// One feed item from a list of clips (1 = a plain clip card, 2+ = a clip set).
// Card fields follow clip 1; `published` is the newest clip's.
export function buildClipItem(clips, { section, gameId } = {}) {
  if (!clips.length) return null;
  const first = clips[0];
  const newest = clips
    .map((c) => c.published)
    .filter(Boolean)
    .sort()
    .pop() || first.published || "";
  const item = {
    id: first.id,
    headline: first.headline,
    description: "",
    published: newest,
    imageUrl: first.imageUrl,
    articleUrl: `https://www.espn.com/video/clip?id=${first.id}`,
    byline: "",
    section: section || "ESPN Video",
    videoUrl: first.videoUrl,
    ...(first.durationSec ? { durationSec: first.durationSec } : {}),
    // The bake's mark for "this item brought its own mp4": attachEspnVideoClips
    // keeps it and never asks the clip API for it.
    feedClip: true,
    ...(gameId ? { gameId: String(gameId) } : {}),
  };
  if (clips.length > 1) {
    item.clips = clips.map((c) => ({
      id: c.id,
      headline: c.headline,
      videoUrl: c.videoUrl,
      imageUrl: c.imageUrl,
      durationSec: c.durationSec,
      published: c.published,
    }));
  }
  return item;
}

// The clips of one item, whether it is a set or a single.
export function itemClips(item) {
  if (Array.isArray(item?.clips) && item.clips.length) return item.clips;
  if (!item?.videoUrl) return [];
  return [{
    id: String(item.id),
    headline: item.headline,
    videoUrl: item.videoUrl,
    imageUrl: item.imageUrl ?? null,
    durationSec: item.durationSec ?? null,
    published: item.published || "",
  }];
}

// Take the clips with these ids out of every feed item, rebuilding the card
// from what is left (a set of 1 becomes a plain clip, a set of 0 goes). Used
// so a clip the scrape already shows as its own card (the hero, ICYMI) is not
// shown a second time inside a game's set.
export function dropClipIds(items, ids) {
  const out = [];
  for (const item of items) {
    if (!item?.feedClip) { out.push(item); continue; }
    const clips = itemClips(item);
    const left = clips.filter((c) => !ids.has(String(c.id)));
    if (left.length === clips.length) { out.push(item); continue; }
    const rebuilt = buildClipItem(left, { section: item.section, gameId: item.gameId });
    if (rebuilt) out.push(rebuilt);
  }
  return out;
}

// feedJson → feed items for the ESPN Videos card. One item per game (every
// non-talk clip ESPN lists for it, a "Final Game Highlight" recap first), then
// one item per module clip that belongs to no game block in this feed.
//   titleOk(headline) → false drops the clip (the bake's VIDEO_BLOCKLIST and
//   analyst-take guards).
export function collectOneFeedClips(feedJson, nowMs = Date.now(), { titleOk = () => true } = {}) {
  const feed = Array.isArray(feedJson?.feed) ? feedJson.feed : [];
  const used = new Set();
  const games = [];
  const gameIds = new Set();

  // Pass 1: game blocks. ESPN's own order, recap first.
  for (const entry of feed) {
    const data = entry?.data;
    const ev = data?.event;
    if (!ev || !Array.isArray(ev.videos)) continue;
    const gameId = String(ev.id ?? "");
    if (!gameId || gameIds.has(gameId)) continue;
    gameIds.add(gameId);
    const now0 = Array.isArray(data.now) ? data.now[0] : null;
    const section = str(ev.leagueInfo?.shortName) || str(now0?.section) || str(now0?.header?.title);
    // The strip, then any clip of this game that only sits in a Media inline.
    const raw = [...ev.videos];
    for (const v of collectMedia(data.now, [])) {
      if (String(v.gameId ?? "") === gameId) raw.push(v);
    }
    const clips = [];
    for (const v of raw) {
      const c = toClip(v, nowMs, titleOk);
      if (!c || used.has(c.id)) continue;
      used.add(c.id);
      clips.push(c);
    }
    const recap = clips.findIndex((c) => RECAP_KIND_RX.test(c.kind));
    if (recap > 0) clips.unshift(...clips.splice(recap, 1));
    const item = buildClipItem(clips, { section, gameId });
    if (item) games.push(item);
  }

  // Pass 2: module clips. A clip of a game that has its own block is already
  // in that game's set; anything else is a plain card under the module title.
  const singles = [];
  for (const entry of feed) {
    const data = entry?.data;
    if (!data || data.event) continue;
    const now0 = Array.isArray(data.now) ? data.now[0] : null;
    const section = str(now0?.header?.title) || str(now0?.section);
    for (const v of collectMedia(data.now, [])) {
      if (gameIds.has(String(v.gameId ?? ""))) continue;
      const c = toClip(v, nowMs, titleOk);
      if (!c || used.has(c.id)) continue;
      used.add(c.id);
      singles.push(buildClipItem([c], { section }));
    }
  }

  return [...games, ...singles];
}
