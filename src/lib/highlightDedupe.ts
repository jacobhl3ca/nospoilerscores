// Belt-and-suspenders render guard for GameHighlights' two YouTube buttons:
// baked ids are already deduped against each other in
// getChannelVerifiedBakedId (highlights.ts), and a live-resolved 2nd id is
// re-resolved excluding the official id — but both of those run at RESOLVE
// time. This runs at RENDER time so a duplicate that slips past either path
// (e.g. a click-time resolve racing the other button) still can't put the
// same clip behind two buttons.
//
// Zero imports on purpose: highlights.ts pulls in "@/lib/youtube", which the
// plain `node --test` unit runner can't resolve, so this stays its own file
// to keep the guard unit-testable without a bundler.
export function isDuplicateHighlightId(officialId: string | null | undefined, secondId: string | null | undefined): boolean {
  return !!officialId && !!secondId && officialId === secondId;
}
