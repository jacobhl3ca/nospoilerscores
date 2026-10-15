// The game / event detail sheets and the video player are closed at first
// paint, but they must open in the frame of the tap: focus and Escape go to
// the sheet at once, and a video starts from the tap's user gesture. So they
// are not next/dynamic (that suspends one render on first open). Their code
// loads once the board has loaded and the page is idle; from then on
// HomeContent renders them from this cache with no wait, like a static
// import. A tap (or a shared ?v= link) before that loads them at once.
import type VideoModal from "./VideoModal";
import type GameDetailModal from "./GameDetailModal";
import type EventDetailModal from "./EventDetailModal";

export interface WarmModals {
  VideoModal: typeof VideoModal;
  GameDetailModal: typeof GameDetailModal;
  EventDetailModal: typeof EventDetailModal;
}

let loaded: WarmModals | null = null;
let pending: Promise<WarmModals> | null = null;

export function warmedModals(): WarmModals | null {
  return loaded;
}

export function warmModals(): Promise<WarmModals> {
  if (loaded) return Promise.resolve(loaded);
  pending ??= Promise.all([import("./VideoModal"), import("./GameDetailModal"), import("./EventDetailModal")])
    .then(([v, g, e]) => (loaded = { VideoModal: v.default, GameDetailModal: g.default, EventDetailModal: e.default }))
    // A failed chunk (offline) may be asked for again later.
    .catch((err) => { pending = null; throw err; });
  return pending;
}
