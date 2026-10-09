import type { NewsItem } from "./news";

// A "plain article" = not Reddit, no clip, no full-size picture set, no body.
// The modal adds nothing for one: a bigger thumb, the same headline and "Open
// on ESPN". So when its headline is already shown, a tap on the row opens the
// article instead (Jacob 10/9). The clip check mirrors itemIsVideo in
// components/NewsColumn.tsx, duplicated so this lib module (and its unit test)
// doesn't reach into a "use client" React component file.
export function isPlainArticle(item: NewsItem): boolean {
  const isClip = !!(item.youtubeVideoId || item.playbackUrl || item.videoUrl || item.embedUrl);
  return !item.section?.startsWith("r/") && !isClip && !item.imageFullUrl && !item.images?.length && !item.body;
}
