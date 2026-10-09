import type { Sport } from "./types";

// The league lists one Add in the "More leagues" sheet writes (Jacob 10/1:
// "multi select … add btn"). Its own file so the unit test can load it
// without the rest of preferences.ts.
export interface AddMoreLists {
  hiddenLeagues?: Sport[];
  catalogHiddenLeagues?: Sport[];
  removedLeagues?: Sport[];
  shownLeagues?: Sport[];
}

const without = (list: Sport[], drop: Sport[]) => {
  const out = list.filter((s) => !drop.includes(s));
  return out.length ? out : undefined;
};

// The picks in tap order, merged into the column's league list. Every pick
// comes back from a switcher hide, a catalog strike and the "Previously
// removed" group, the same un-hide one pick gets. A pick the switcher would
// still skip after that (`listed` false: an opt-in league, or one outside the
// in-season list) goes into shownLeagues, so the ‹ › arrows and the dropdown
// reach it. Only the lists that change are in the patch; an emptied list is
// undefined, so the saved prefs carry no empty array.
export function mergeAddMorePicks(
  picks: Sport[],
  lists: AddMoreLists,
  listed: (sport: Sport) => boolean,
): AddMoreLists {
  const patch: AddMoreLists = {};
  const hidden = lists.hiddenLeagues ?? [];
  const struck = lists.catalogHiddenLeagues ?? [];
  const removed = lists.removedLeagues ?? [];
  const shown = lists.shownLeagues ?? [];
  if (picks.some((s) => hidden.includes(s))) patch.hiddenLeagues = without(hidden, picks);
  if (picks.some((s) => struck.includes(s))) patch.catalogHiddenLeagues = without(struck, picks);
  if (picks.some((s) => removed.includes(s))) patch.removedLeagues = without(removed, picks);
  const toShow = picks.filter((s, i) => picks.indexOf(s) === i && !shown.includes(s) && !listed(s));
  if (toShow.length) patch.shownLeagues = [...shown, ...toShow];
  return patch;
}

// What one Add does with the lit pills (PR #314 review). The dropdown lists
// in-season leagues only (inSeasonSwitcherOptions), and a scores column
// pinned to an offseason league other than NBA takes its Auto league
// (resolveSlot in espn.ts). So the column takes the first pick it can show
// (`columnTakes`: always true for an in-season pick), the other in-season
// picks join its dropdown, and the other offseason picks are saved like the
// rest and show when their season starts. The sheet's "Add N" counts `now`,
// and a note names `later`.
export interface AddMorePlan {
  // The column's league first, then the other in-season picks, in tap order.
  now: Sport[];
  // The offseason picks past the column's, in tap order.
  later: Sport[];
}

export function planAddMorePicks(
  picks: Sport[],
  offseason: (sport: Sport) => boolean,
  columnTakes: (sport: Sport) => boolean,
): AddMorePlan {
  const unique = picks.filter((s, i) => picks.indexOf(s) === i);
  const column = unique.find((s) => !offseason(s) || columnTakes(s));
  const rest = unique.filter((s) => s !== column);
  return {
    now: [...(column ? [column] : []), ...rest.filter((s) => !offseason(s))],
    later: rest.filter((s) => offseason(s)),
  };
}
