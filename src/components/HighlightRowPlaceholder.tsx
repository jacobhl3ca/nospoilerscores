// An invisible stand-in for a highlight button row.
//
// Why it exists: a finished card whose highlight never resolves used to render
// nothing at all, so it sat one button-row shorter than the finished card next
// to it. In a column of three NWSL finals where only one had a video, two cards
// were visibly stunted with nothing on screen explaining why (Jacob 8/9). The
// same gap showed across columns — a race tile with no highlight was shorter
// than the MLB card beside it.
//
// It reserves space by rendering the REAL button markup with `invisible`
// (visibility: hidden) rather than a hand-measured spacer height. Any future
// change to the button's padding, icon size or font moves this in lockstep;
// a hard-coded height would silently drift the day someone touches PlayBtn.
//
// aria-hidden + no focusable child: assistive tech and keyboard tabbing skip it
// entirely, so this is layout only — it never announces a button that isn't
// there.
export default function HighlightRowPlaceholder({ wrapMargin = "mt-1 sm:mt-2" }: { wrapMargin?: string }) {
  return (
    <div className={`${wrapMargin} flex gap-1`} aria-hidden="true">
      <span className="flex min-w-0 items-center justify-center gap-1 py-1.5 rounded-md flex-1 invisible">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
        <span className="text-[10px] font-medium">&nbsp;</span>
      </span>
    </div>
  );
}
