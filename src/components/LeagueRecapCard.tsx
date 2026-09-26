"use client";

import { useEffect, useState } from "react";
import { getRecapsFor, getRecapsForSync, formatRecapDuration, recapButtonText, rowRecapHeadings, stackedRecapHeadings, RECAP_STACK_MAX_PX, RECAP_COMPACT_MAX_PX, type RecapRecord } from "@/lib/recaps";
import { leadChannelBlocksEmbeds } from "@/lib/youtube";
import type { PlayHandler, PlayOpts } from "@/components/NewsColumn";

// The league-wide recap — the NFL's "Week 1", MLB's "Best of the day", NBA's
// "Top 10 plays of the night", EPL / MLS "Every goal" — as one compact pill on
// TOP of a league column on past-date boards. Self-contained like
// WorldCupMattersCard: fetches its own records (one static /news/recaps.json
// per session), resets on a date change, and renders nothing at all when no
// record covers the day, so it has zero layout impact anywhere else.
//
// ⛔ Never prints the video title, thumbnail or channel headline — they spoil
// ("WALK-OFF WEEKEND in Cleveland…"). Left = the series heading, right = one
// "▶ 8m" button per cut, shortest first — or a word for the cuts in
// RECAP_BUTTON_TEXT (MLB's "Top 5" first, "Oddities" last).
//
// ⛔ Not wrapped in .hl-slot: the card-height floor (globals.css) keys on a
// .highlight-btn INSIDE .hl-slot, and this pill is not a game card.
//
// Two layouts, chosen by the pill's own measured width (RECAP_STACK_MAX_PX):
//   • wide (xl, 280px columns): heading left, buttons right, one row.
//   • narrow (phone 114px, sm 192px, md 225px): heading on top, buttons in a row under
//     it, each button an equal share of the width. One row could not hold the
//     NFL's three cuts plus a heading — the buttons ran into the next column
//     and MLB's heading truncated to "Best of…" (Jacob 9/24). The heading is
//     the first of stackedRecapHeadings that fits its 100px line ("Week 2
//     highlights", else "W2"), measured on hidden copies of each candidate.
// The reserveSlot spacer mirrors whichever layout is live so sibling columns
// keep the same top offset.
//
// `onShowPlayoffs`: the same row on TODAY's MLB column during the playoff
// window holds a "Playoff" pill with three text buttons — Bracket, Odds,
// Picks — each opening the playoff picture on that tab (Jacob 9/25: "just have
// playoff word, then 3 selectable things"). Same pill and button box model, so
// it lines up with a sibling's recap exactly as a recap does, and on a phone it
// stacks the same way: "Playoff" on top, the three buttons in a row under it.
// When the day also has a recap, the recap keeps the heading and a bracket
// icon joins its buttons, last.
//
// `onPlayList`: each button opens its cut with the pill's other cuts as
// siblings, so the modal pages through them — Shift+←/→ or ↑/↓, or the
// ‹ › buttons — without closing (Jacob 9/26: "shift click to cycle the best
// of day highlights").

// Outer pill and button classes per layout (see the header note). Shared by
// the real pill and the reserveSlot spacer so their heights always agree.
const ROW_PILL = "items-center gap-2 px-2.5 py-1.5";
const STACKED_PILL = "flex-col gap-1 px-1.5 py-1.5";
const ROW_BTN = "gap-1 px-2";
const STACKED_BTN = "flex-1 min-w-0 gap-0.5 px-0";
// A phone row with a word button (see fitButtons): each button sized by its
// text plus an equal share of what is left.
const STACKED_FIT_BTN = "flex-auto gap-0.5 px-0";

export type PlayoffsTab = "bracket" | "odds" | "picks";
const PLAYOFFS_TABS: { key: PlayoffsTab; label: string }[] = [
  { key: "bracket", label: "Bracket" },
  { key: "odds", label: "Odds" },
  { key: "picks", label: "Picks" },
];

export default function LeagueRecapCard({
  sport,
  date,
  lastPlayedDate,
  reserveSlot = false,
  onShowPlayoffs,
  onPlayList,
}: {
  sport: string;
  date: string;
  // `previousGameDay.date` when the column is showing the "Last played" slate
  // — the NFL Week-1 card must follow that slate through the Tue/Wed the cut
  // posts on. YYYYMMDD, same format as `date`.
  lastPlayedDate?: string | null;
  // A sibling column on the same side-by-side board shows a pill. With no
  // records of our own, render an invisible row of the same height so the
  // first game cards of every column sit at the same y — the same idea as
  // PlayoffSubtitle's transparent header spacer.
  reserveSlot?: boolean;
  // Opens the playoff picture on the given tab. Set only when the playoffs
  // pill is due (see the header note).
  onShowPlayoffs?: ((tab: PlayoffsTab) => void) | null;
  onPlayList?: PlayHandler;
}) {
  const ymd = lastPlayedDate || date;
  // Seeded from the session cache when recaps.json already landed — HomeContent
  // fetches it with the scores — so the pill is in the column's first paint.
  // Only a cold cache (a direct deep link before that fetch resolves) waits for
  // the effect below.
  const [records, setRecords] = useState<RecapRecord[]>(() => getRecapsForSync(sport, ymd) ?? []);
  const [prevKey, setPrevKey] = useState(`${sport}|${ymd}`);
  // Stacked (narrow) until measured — the phone is the case that breaks, so
  // the first paint must not be the one-row layout. A callback ref rather
  // than useRef: the pill and its spacer are different elements, and the
  // observer has to follow whichever one is mounted.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [stacked, setStacked] = useState(true);
  const [compact, setCompact] = useState(true);
  // A short heading that still overflows its line on the stacked layout is
  // dropped rather than ellipsised (Jacob 9/24: "to nothing if none fit"). The
  // line stays so the pill keeps the spacer's height; the buttons' aria-labels
  // still carry the series name.
  const [headingHidden, setHeadingHidden] = useState(false);
  // Index into the heading candidates (stackedRecapHeadings on the stacked
  // layout, rowRecapHeadings on the row): the first whose hidden copy fits the
  // heading's line.
  const [headingPick, setHeadingPick] = useState(0);
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      const narrow = el.clientWidth < RECAP_STACK_MAX_PX;
      setStacked(narrow);
      setCompact(el.clientWidth < RECAP_COMPACT_MAX_PX);
      const heading = el.querySelector<HTMLElement>("[data-recap-heading]");
      const copies = [...el.querySelectorAll<HTMLElement>("[data-recap-heading-candidate]")];
      // The copies on screen belong to the layout of the last render; a flip
      // re-runs this effect (`stacked` below) and measures the new set.
      if (heading && copies.length) {
        const fit = copies.findIndex((c) => c.getBoundingClientRect().width <= heading.clientWidth);
        setHeadingPick(fit < 0 ? copies.length - 1 : fit);
        setHeadingHidden(fit < 0);
      } else {
        setHeadingHidden(!!heading && heading.scrollWidth > heading.clientWidth);
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // `records` too: a new heading on the same element gets no resize event.
    // `stacked` too: each layout mounts its own candidate copies.
  }, [el, records, stacked]);
  // Stacked buttons are sized for the phone: a 114px column leaves 100px inside
  // px-1.5, three buttons at gap-0.5 get 32px each, and "▸ 30m" at 9px with a
  // 9px glyph measures ~31px (measured 2026-09-24, Geist 500). Wider pills,
  // stacked or not, keep the 10px glyph and text.
  const glyph = compact ? 9 : 10;
  const minsText = compact ? "text-[9px]" : "text-[10px]";

  // Clear on a sport/date change during render (React's reset-on-prop pattern,
  // as WorldCupMattersCard does) so the previous day's buttons never flash.
  if (`${sport}|${ymd}` !== prevKey) {
    setPrevKey(`${sport}|${ymd}`);
    setRecords(getRecapsForSync(sport, ymd) ?? []);
  }

  useEffect(() => {
    if (!sport || !/^\d{8}$/.test(ymd)) return;
    let alive = true;
    getRecapsFor(sport, ymd)
      .then((list) => {
        if (alive) setRecords(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sport, ymd]);

  // Icon only, for a day that also has a recap. The zero-width text keeps the
  // button's line box, so it is as tall as a "▶ 8m" button.
  const bracketButton = onShowPlayoffs ? (
    <button
      type="button"
      data-recap-bracket
      onClick={(e) => {
        e.stopPropagation();
        onShowPlayoffs("bracket");
      }}
      className={`highlight-btn flex items-center justify-center rounded-md py-1 transition-opacity hover:opacity-80 cursor-pointer ${stacked ? STACKED_BTN : ROW_BTN}`}
      style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
      aria-label="Playoff bracket"
      title="Playoff bracket"
    >
      <svg aria-hidden="true" className="shrink-0" width={glyph + 2} height={glyph + 2} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h6v14H3M9 12h6M15 8h6M15 16h6M15 8v8" /></svg>
      <span aria-hidden="true" className={`${minsText} font-medium`}>{"\u200B"}</span>
    </button>
  ) : null;

  if (!records.length && onShowPlayoffs) {
    return (
      <div
        ref={setEl}
        data-league-recap={sport}
        data-recap-kind="playoffs"
        data-recap-layout={stacked ? "stacked" : "row"}
        className={`mb-2 rounded-lg flex ${stacked ? STACKED_PILL : ROW_PILL}`}
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <span
          data-recap-heading
          className="flex-1 min-w-0 text-[11.5px] font-semibold tracking-tight truncate"
          style={{ color: "var(--text)" }}
        >
          Playoff
        </span>
        <div className={`flex shrink-0 ${stacked ? "gap-0.5" : "gap-1"}`}>
          {PLAYOFFS_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              data-recap-playoffs-tab={t.key}
              onClick={(e) => {
                e.stopPropagation();
                onShowPlayoffs(t.key);
              }}
              // Stacked: sized by their words plus an equal share of what is
              // left, since "Bracket" needs ~33px and an even third is 32px.
              className={`highlight-btn flex items-center justify-center rounded-md py-1 transition-opacity hover:opacity-80 cursor-pointer ${stacked ? "flex-auto gap-0.5 px-0" : ROW_BTN}`}
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
              aria-label={`Playoff ${t.label.toLowerCase()}`}
              title={`Playoff ${t.label.toLowerCase()}`}
            >
              <span className={`${minsText} font-medium whitespace-nowrap`}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!records.length) {
    if (!reserveSlot) return null;
    // Same box model as the real pill: 1px (transparent) border, padding, and
    // a text span + one button skeleton so the height is identical.
    // `invisible` keeps layout and hides paint; a <span> stands in for the
    // button so nothing here is focusable or read out.
    return (
      <div
        ref={setEl}
        aria-hidden="true"
        data-league-recap-spacer={sport}
        data-recap-layout={stacked ? "stacked" : "row"}
        className={`mb-2 rounded-lg flex invisible ${stacked ? STACKED_PILL : ROW_PILL}`}
        style={{ border: "1px solid transparent" }}
      >
        <span className="flex-1 min-w-0 text-[11.5px] font-semibold tracking-tight truncate">&nbsp;</span>
        <div className={`flex shrink-0 ${stacked ? "gap-0.5" : "gap-1"}`}>
          <span className={`highlight-btn flex items-center justify-center rounded-md py-1 ${stacked ? STACKED_BTN : ROW_BTN}`}>
            <svg aria-hidden="true" className="shrink-0" width={glyph} height={glyph} viewBox="0 0 24 24" />
            <span className={`${minsText} font-medium whitespace-nowrap`}>0m</span>
          </span>
        </div>
      </div>
    );
  }

  // A watch?v= fallback has no search_query, so a failed embed goes straight
  // to the "Watch on YouTube" card. Channels that refuse embeds (NFL, the
  // clubs) carry the strict channel gate so VideoModal skips the player —
  // unless the bake measured THIS video as embeddable (the NFL's Top 15 and
  // Every TD cuts are; Sunday's best is not).
  const youtubeFallback = (rec: RecapRecord, videoId: string) => {
    const base = `https://www.youtube.com/watch?v=${videoId}`;
    return rec.embeddable !== true && leadChannelBlocksEmbeds([rec.channel])
      ? `${base}&nss_strict=1&nss_channels=${encodeURIComponent(rec.channel)}`
      : base;
  };
  // The modal payload for one cut: MLB.com HLS (the same path the per-game
  // 3m / 10m buttons take) or a YouTube id. Null = nothing to play.
  const toOpts = (rec: RecapRecord): PlayOpts | null => {
    if (rec.playbackUrl) return { fallbackUrl: rec.pageUrl, playbackUrl: rec.playbackUrl, poster: rec.poster ?? null, sourceLabel: "MLB.com" };
    if (rec.videoId) return { videoId: rec.videoId, fallbackUrl: youtubeFallback(rec, rec.videoId) };
    return null;
  };
  const playableRecs = records.filter((r) => toOpts(r) !== null);
  const playable = playableRecs.map((r) => toOpts(r) as PlayOpts);

  const play = (rec: RecapRecord) => {
    const opts = toOpts(rec);
    if (!opts || !onPlayList) return;
    onPlayList({ ...opts, siblings: playable, index: playableRecs.indexOf(rec) });
  };

  const candidates = stacked ? stackedRecapHeadings(records[0].heading) : rowRecapHeadings(records[0].heading);
  // Four buttons (MLB on a round-up day: Top 5, 1m, 15m, Oddities) overran a
  // 225px desktop column by 24px and a phone's 100px row (measured
  // 2026-09-25), so words take their short form, and on the phone the ▶s go.
  const crowded = records.length + (bracketButton ? 1 : 0) >= 4;
  // A phone row with a word in it is sized by content plus an equal share of
  // what is left: an even third (26px at 340px) cut "▶ 15m" by a pixel.
  const fitButtons = stacked && (crowded || records.some((r) => recapButtonText(r) !== null));

  return (
    <div
      ref={setEl}
      data-league-recap={sport}
      data-recap-layout={stacked ? "stacked" : "row"}
      className={`relative mb-2 rounded-lg flex ${stacked ? STACKED_PILL : ROW_PILL}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <span
        data-recap-heading
        // `invisible`, not unmounted: the text must stay measurable, or the
        // next measure would see an empty span and bring it back (flicker).
        className={`flex-1 min-w-0 text-[11.5px] font-semibold tracking-tight truncate ${headingHidden ? "invisible" : ""}`}
        aria-hidden={headingHidden || undefined}
        style={{ color: "var(--text)" }}
      >
        {candidates[Math.min(headingPick, candidates.length - 1)]}
      </span>
      {/* Hidden, out-of-flow copies of each candidate at the heading's font,
          so measure() can pick the longest that fits. After the heading, which
          stays the pill's first span. */}
      {candidates.map((text) => (
        <span
          key={text}
          data-recap-heading-candidate
          aria-hidden="true"
          className="absolute left-0 top-0 invisible pointer-events-none whitespace-nowrap text-[11.5px] font-semibold tracking-tight"
        >
          {text}
        </span>
      ))}
      <div className={`flex shrink-0 ${stacked ? "gap-0.5" : "gap-1"}`}>
        {records.map((rec) => {
          const mins = formatRecapDuration(rec.durationSec);
          // A word ("Top 5", "Oddities") instead of minutes for the cuts in
          // RECAP_BUTTON_TEXT. The word says what it is, so it carries no ▶;
          // the minutes buttons keep theirs unless a phone row is crowded.
          const word = recapButtonText(rec, stacked || crowded);
          const text = word ?? mins;
          const showGlyph = !word && !(stacked && crowded);
          return (
            <button
              key={`${rec.key}:${rec.videoId ?? rec.pageUrl}`}
              type="button"
              data-recap-key={rec.key}
              onClick={(e) => {
                e.stopPropagation();
                play(rec);
              }}
              className={`highlight-btn flex items-center justify-center rounded-md py-1 transition-opacity hover:opacity-80 cursor-pointer ${stacked ? (fitButtons ? STACKED_FIT_BTN : STACKED_BTN) : ROW_BTN}`}
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
              aria-label={mins ? `${rec.label} (${mins})` : rec.label}
              title={mins ? `${rec.label} (${mins})` : rec.label}
            >
              {showGlyph && <svg aria-hidden="true" className="shrink-0" width={glyph} height={glyph} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>}
              {text && <span className={`${minsText} font-medium whitespace-nowrap`}>{text}</span>}
            </button>
          );
        })}
        {bracketButton}
      </div>
    </div>
  );
}
