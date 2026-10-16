// Arrow-key focus moves inside a role="tablist" (the WAI-ARIA tabs pattern).
//
// ←/→ step to the previous / next tab and wrap; Home / End go to the first /
// last tab. Focus moves only: the view tab bar uses manual activation, so
// Enter or Space (the tab is a real <button>) switches the view, so walking
// the bar with arrows does not load each view on the way.
//
// A leaf module so the `node --test` unit runner can load it (HomeContent is a
// component it can't load; same reason modalArrowKeys.ts exists).

/** Index of the tab to focus, or null = leave the key alone (no preventDefault). */
export function tabKeyTarget(key: string, index: number, count: number): number | null {
  if (count <= 0 || index < 0 || index >= count) return null;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
