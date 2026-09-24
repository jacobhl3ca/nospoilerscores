"use client";

import { useLayoutEffect, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import HomeContent from "@/components/HomeContent";
import { parseYouTubeId, readWatchQuery } from "@/lib/youtubeLink";

// The query string, read without a set-state-in-effect: null while hydrating
// (the static HTML is the landing), the real search right after. /watch never
// changes its own query before it hands over to HomeContent, so nothing to
// subscribe to.
const noSubscribe = () => () => {};
function useWatchQuery(): { id: string | null; raw: string | null } | null {
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => null);
  return useMemo(() => (search === null ? null : readWatchQuery(search)), [search]);
}

// /watch — paste any YouTube highlight link and play it in HideScore's own
// player with the title covered. The static HTML is the landing (the paste
// box + FAQ, which is also what a crawler reads). A link that carries a video
// (?v= / ?url= / the share-target ?text= and ?title=) swaps the landing for
// the board with the modal open on that clip.
//
// The pathname stays /watch on purpose. The worker rewrites the Open Graph
// preview only on "/", where it uses the YouTube thumbnail — a spoiler for a
// link someone shares as "watch this without the score". /watch keeps the
// generic preview.
export default function WatchAnyLink({ children }: { children: ReactNode }) {
  const query = useWatchQuery();
  // Latched on the first read, the "adjust state while rendering" pattern.
  // Closing the modal strips ?v= from the address bar, and without the latch
  // any later re-render would swap the board back to the landing.
  const [videoId, setVideoId] = useState<string | null>(null);
  if (query?.id && videoId === null) setVideoId(query.id);

  // A LAYOUT effect on purpose. HomeContent opens the modal from its own ?v=
  // reader in a passive effect on mount, and React runs every layout effect
  // of a commit before any passive one, so the URL is rewritten before that
  // reader looks. Dropping url/text/title also leaves a clean address bar
  // link that reopens the same clip.
  useLayoutEffect(() => {
    if (videoId) window.history.replaceState(window.history.state, "", `/watch?v=${videoId}`);
  }, [videoId]);
  useLayoutEffect(() => {
    if (query && !query.id) document.documentElement.removeAttribute("data-watch-pending");
  }, [query]);

  if (videoId) return <HomeContent initialOffset={-1} />;
  return <div className="watch-landing">{children}</div>;
}

// The paste box on the landing. A deep link that did not parse arrives with
// its value in the box and the error showing. null = the user has not typed
// yet, so the deep link's value shows.
export function WatchPasteBox() {
  const query = useWatchQuery();
  const deepLinkFailed = !!query && !query.id && !!query.raw;
  const [typed, setTyped] = useState<string | null>(null);
  const [typedError, setTypedError] = useState<boolean | null>(null);
  const value = typed ?? (deepLinkFailed ? query.raw! : "");
  const error = typedError ?? deepLinkFailed;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const id = parseYouTubeId(value);
    if (!id) {
      setTypedError(true);
      return;
    }
    window.location.assign(`/watch?v=${id}`);
  };

  return (
    <form onSubmit={submit} className="mb-6" noValidate>
      <label htmlFor="watch-link" className="block text-sm font-semibold mb-2">
        YouTube link
      </label>
      <div className="flex gap-2">
        <input
          id="watch-link"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://youtu.be/…"
          value={value}
          onChange={(e) => { setTyped(e.target.value); setTypedError(false); }}
          aria-invalid={error}
          aria-describedby={error ? "watch-link-error" : undefined}
          className="min-w-0 flex-1 rounded-lg px-3 py-2.5"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <button
          type="submit"
          className="rounded-lg px-5 py-2.5 font-semibold"
          style={{ background: "var(--accent)", color: "#fff" }}
          data-umami-event="watch-paste-submit"
        >
          Watch
        </button>
      </div>
      {error && (
        <p id="watch-link-error" role="alert" className="mt-2 text-sm" style={{ color: "#e5484d" }}>
          That is not a YouTube video link. Paste a youtube.com or youtu.be link.
        </p>
      )}
    </form>
  );
}
