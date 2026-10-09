import type { NewsCardPrefs } from "./preferences";

// News Posts switch (Jacob 10/9): one 3-way control in place of the old
// Videos only + Text posts pair. With Videos only on, Text posts did nothing,
// so the 2 buttons only ever had 3 real states. The prefs underneath stay the
// same 2 booleans, so old saves and older builds keep working.
//   all    = videosOnly false, textPosts true
//   notext = videosOnly false, textPosts false
//   videos = videosOnly true (textPosts left as is)
export type PostFilter = "all" | "notext" | "videos";

export const POST_FILTERS: PostFilter[] = ["all", "notext", "videos"];

export const POST_FILTER_NAMES: Record<PostFilter, string> = {
  all: "All",
  notext: "No text",
  videos: "Videos",
};

export function postFilterOf(videosOnly: boolean | undefined, textPosts: boolean | undefined): PostFilter {
  if (videosOnly) return "videos";
  return textPosts ? "all" : "notext";
}

export function postFilterPatch(f: PostFilter): Pick<NewsCardPrefs, "videosOnly" | "textPosts"> {
  if (f === "videos") return { videosOnly: true };
  return { videosOnly: false, textPosts: f === "all" };
}

// The global prefs for a Posts value (same mapping, global field names).
export function globalPostFilterPatch(f: PostFilter): { newsVideosOnly: boolean; showTextPosts?: boolean } {
  const p = postFilterPatch(f);
  return p.textPosts === undefined ? { newsVideosOnly: !!p.videosOnly } : { newsVideosOnly: !!p.videosOnly, showTextPosts: p.textPosts };
}

// A copy of the per-card prefs with `fields` deleted from every entry, so each
// card follows the global value again. Entries left empty are dropped.
export function clearCardField(
  cardPrefs: Record<string, NewsCardPrefs> | undefined,
  fields: (keyof NewsCardPrefs)[],
): Record<string, NewsCardPrefs> {
  const out: Record<string, NewsCardPrefs> = {};
  for (const [key, cp] of Object.entries(cardPrefs ?? {})) {
    const next: NewsCardPrefs = { ...cp };
    for (const f of fields) delete next[f];
    if (Object.keys(next).length > 0) out[key] = next;
  }
  return out;
}
