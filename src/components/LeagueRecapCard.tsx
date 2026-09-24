"use client";

import { useEffect, useState } from "react";
import { getRecapsFor, formatRecapDuration, shortRecapHeading, RECAP_STACK_MAX_PX, type RecapRecord } from "@/lib/recaps";
import { leadChannelBlocksEmbeds } from "@/lib/youtube";
import type { ShareCardMeta } from "@/lib/shareCard";

// The league-wide recap — the NFL's "Week 1", MLB's "Best of the day", NBA's
// "Top 10 plays of the night", EPL / MLS "Every goal" — as one compact pill on
// TOP of a league column on past-date boards. Self-contained like
// WorldCupMattersCard: fetches its own records (one static /news/recaps.json
// per session), resets on a date change, and renders nothing at all when no
// record covers the day, so it has zero layout impact anywhere else.
//
// ⛔ Never prints the video title, thumbnail or channel headline — they spoil
// ("WALK-OFF WEEKEND in Cleveland…"). Left = the series heading, right = one
// "▶ 8m" button per cut, shortest first.
//
// ⛔ Not wrapped in .hl-slot: the card-height floor (globals.css) keys on a
// .highlight-btn INSIDE .hl-slot, and this pill is not a game card.
//
// Two layouts, chosen by the pill's own measured width (RECAP_STACK_MAX_PX):
//   • wide (md+, 225px columns): heading left, buttons right, one row.
//   • narrow (phone 114px, sm 192px): heading on top, buttons in a row under
//     it, each button an equal share of the width. One row could not hold the
//     NFL's three cuts plus a heading — the buttons ran into the next column
//     and MLB's heading truncated to "Best of…" (Jacob 9/24). The heading uses
//     shortRecapHeading here so it fits its 100px line.
// The reserveSlot spacer mirrors whichever layout is live so sibling columns
// keep the same top offset.

// Outer pill and button classes per layout (see the header note). Shared by
// the real pill and the reserveSlot spacer so their heights always agree.
const ROW_PILL = "items-center gap-2 px-2.5 py-1.5";
const STACKED_PILL = "flex-col gap-1 px-1.5 py-1.5";
const ROW_BTN = "gap-1 px-2";
const STACKED_BTN = "flex-1 min-w-0 gap-0.5 px-0";

export default function LeagueRecapCard({
  sport,
  date,
  lastPlayedDate,
  reserveSlot = false,
  onPlayHighlight,
  onPlayEmbed,
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
  onPlayHighlight?: (videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null) => void;
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null, playbackUrl?: string | null, poster?: string | null) => void;
}) {
  const ymd = lastPlayedDate || date;
  const [records, setRecords] = useState<RecapRecord[]>([]);
  const [prevKey, setPrevKey] = useState(`${sport}|${ymd}`);
  // Stacked (narrow) until measured — the phone is the case that breaks, so
  // the first paint must not be the one-row layout. A callback ref rather
  // than useRef: the pill and its spacer are different elements, and the
  // observer has to follow whichever one is mounted.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [stacked, setStacked] = useState(true);
  // A short heading that still overflows its line on the stacked layout is
  // dropped rather than ellipsised (Jacob 9/24: "to nothing if none fit"). The
  // line stays so the pill keeps the spacer's height; the buttons' aria-labels
  // still carry the series name.
  const [headingHidden, setHeadingHidden] = useState(false);
  useEffect(() => {
    if (!el) return;
    const measure = () => {
      const narrow = el.clientWidth < RECAP_STACK_MAX_PX;
      setStacked(narrow);
      const heading = el.querySelector<HTMLElement>("[data-recap-heading]");
      setHeadingHidden(narrow && !!heading && heading.scrollWidth > heading.clientWidth);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // `records` too: a new heading on the same element gets no resize event.
  }, [el, records]);
  // Stacked buttons are sized for the phone: a 114px column leaves 100px inside
  // px-1.5, three buttons at gap-0.5 get 32px each, and "▸ 30m" at 9px with a
  // 9px glyph measures ~31px (measured 2026-09-24, Geist 500). The row layout
  // keeps the 10px glyph and text.
  const glyph = stacked ? 9 : 10;
  const minsText = stacked ? "text-[9px]" : "text-[10px]";

  // Clear on a sport/date change during render (React's reset-on-prop pattern,
  // as WorldCupMattersCard does) so the previous day's buttons never flash.
  if (`${sport}|${ymd}` !== prevKey) {
    setPrevKey(`${sport}|${ymd}`);
    setRecords([]);
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

  const play = (rec: RecapRecord) => {
    if (rec.playbackUrl) {
      // MLB.com HLS — the same path the per-game 3m / 10m buttons take.
      if (onPlayEmbed) onPlayEmbed("", rec.pageUrl, "MLB.com", null, rec.playbackUrl, rec.poster ?? null);
      return;
    }
    if (!rec.videoId || !onPlayHighlight) return;
    // A watch?v= fallback has no search_query, so a failed embed goes straight
    // to the "Watch on YouTube" card. Channels that refuse embeds (NFL, the
    // clubs) carry the strict channel gate so VideoModal skips the player —
    // unless the bake measured THIS video as embeddable (the NFL's Top 15 and
    // Every TD cuts are; Sunday's best is not).
    const base = `https://www.youtube.com/watch?v=${rec.videoId}`;
    const fallbackUrl = rec.embeddable !== true && leadChannelBlocksEmbeds([rec.channel])
      ? `${base}&nss_strict=1&nss_channels=${encodeURIComponent(rec.channel)}`
      : base;
    onPlayHighlight(rec.videoId, fallbackUrl);
  };

  return (
    <div
      ref={setEl}
      data-league-recap={sport}
      data-recap-layout={stacked ? "stacked" : "row"}
      className={`mb-2 rounded-lg flex ${stacked ? STACKED_PILL : ROW_PILL}`}
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
        {stacked ? shortRecapHeading(records[0].heading) : records[0].heading}
      </span>
      <div className={`flex shrink-0 ${stacked ? "gap-0.5" : "gap-1"}`}>
        {records.map((rec) => {
          const mins = formatRecapDuration(rec.durationSec);
          return (
            <button
              key={`${rec.key}:${rec.videoId ?? rec.pageUrl}`}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                play(rec);
              }}
              className={`highlight-btn flex items-center justify-center rounded-md py-1 transition-opacity hover:opacity-80 cursor-pointer ${stacked ? STACKED_BTN : ROW_BTN}`}
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
              aria-label={mins ? `${rec.label} (${mins})` : rec.label}
              title={mins ? `${rec.label} (${mins})` : rec.label}
            >
              <svg aria-hidden="true" className="shrink-0" width={glyph} height={glyph} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              {mins && <span className={`${minsText} font-medium whitespace-nowrap`}>{mins}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
