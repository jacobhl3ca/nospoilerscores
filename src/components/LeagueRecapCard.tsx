"use client";

import { useEffect, useState } from "react";
import { getRecapsFor, formatRecapDuration, type RecapRecord } from "@/lib/recaps";
import { leadChannelBlocksEmbeds } from "@/lib/youtube";
import type { ShareCardMeta } from "@/lib/shareCard";

// The league-wide recap — "Week 1 top plays", MLB's "Best of the day", NBA's
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

export default function LeagueRecapCard({
  sport,
  date,
  lastPlayedDate,
  onPlayHighlight,
  onPlayEmbed,
}: {
  sport: string;
  date: string;
  // `previousGameDay.date` when the column is showing the "Last played" slate
  // — the NFL Week-1 card must follow that slate through the Tue/Wed the cut
  // posts on. YYYYMMDD, same format as `date`.
  lastPlayedDate?: string | null;
  onPlayHighlight?: (videoId: string, fallbackUrl: string, shareCard?: ShareCardMeta | null) => void;
  onPlayEmbed?: (embedUrl: string, fallbackUrl: string, sourceLabel: string, shareCard?: ShareCardMeta | null, playbackUrl?: string | null, poster?: string | null) => void;
}) {
  const ymd = lastPlayedDate || date;
  const [records, setRecords] = useState<RecapRecord[]>([]);
  const [prevKey, setPrevKey] = useState(`${sport}|${ymd}`);

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

  if (!records.length) return null;

  const play = (rec: RecapRecord) => {
    if (rec.playbackUrl) {
      // MLB.com HLS — the same path the per-game 3m / 10m buttons take.
      if (onPlayEmbed) onPlayEmbed("", rec.pageUrl, "MLB.com", null, rec.playbackUrl, rec.poster ?? null);
      return;
    }
    if (!rec.videoId || !onPlayHighlight) return;
    // A watch?v= fallback has no search_query, so a failed embed goes straight
    // to the "Watch on YouTube" card. Channels that refuse embeds (NFL, the
    // clubs) carry the strict channel gate so VideoModal skips the player.
    const base = `https://www.youtube.com/watch?v=${rec.videoId}`;
    const fallbackUrl = leadChannelBlocksEmbeds([rec.channel])
      ? `${base}&nss_strict=1&nss_channels=${encodeURIComponent(rec.channel)}`
      : base;
    onPlayHighlight(rec.videoId, fallbackUrl);
  };

  return (
    <div
      data-league-recap={sport}
      className="mb-2 rounded-lg flex items-center gap-2 px-2.5 py-1.5"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <span className="flex-1 min-w-0 text-[11.5px] font-semibold tracking-tight truncate" style={{ color: "var(--text)" }}>
        {records[0].heading}
      </span>
      <div className="flex gap-1 shrink-0">
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
              className="highlight-btn flex items-center justify-center gap-1 px-2 py-1 rounded-md transition-opacity hover:opacity-80 cursor-pointer"
              style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
              aria-label={mins ? `${rec.label} (${mins})` : rec.label}
              title={mins ? `${rec.label} (${mins})` : rec.label}
            >
              <svg aria-hidden="true" className="shrink-0" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
              {mins && <span className="text-[10px] font-medium whitespace-nowrap">{mins}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
