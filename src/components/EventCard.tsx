"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { LeagueEventCard, FightBout } from "@/lib/types";
import { fetchFirstVideoId, leadChannelBlocksEmbeds } from "@/lib/youtube";
import { getTimeZone, getEtServiceDate, toYmd, etSlateYmd } from "@/lib/etDay";

// Spoiler-safe event rendering for F1 (one race tile) and UFC (a card PER
// bout). Never shows results (finishing order / fight outcome). Highlights
// surface once an event is over and play in the masked in-app player; if a
// rights-holder blocks embedding (e.g. Formula One Management), the modal
// falls back to its "Watch on YouTube" link.

// ── One line of tile text that must not get cut off ─────────────────────────
//
// The single-event tile hands its title a whole line and puts nothing else on
// it, so when the title is too long there is nothing to trade away and it just
// clipped — "Heineken Dutch Grand …" over "Circuit Park Zandvoort · Zan…"
// (Jacob 8/10). On a race tile the clipped tail IS the identity of the race,
// which makes truncation the worst available outcome rather than a safe net.
//
// Same ladder the fighter names and the golf leaderboard use, in this order:
//   1. every VARIANT (longest first) at the line's natural font size,
//   2. then step the font down 1px at a time, retrying the variants at each
//      size, down to `floorPx`,
//   3. then the shortest variant at the floor, with `truncate` as the last
//      resort — reached only when even the shortest name can't fit at 11px.
//
// ⛔ The natural size is a CEILING, never a starting guess to grow from: this
// text tracks the team-name size of the cards beside it (text-sm, or 1rem on
// the single-column .ns-cards-lg board), and a tile whose title rendered larger
// than the MLB team names next to it is a bug this app has shipped before. The
// cap is READ OFF THE DOM with the inline size cleared, so a board-layout CSS
// rule that changes the class size moves the cap with it automatically.
// The glyph names the sport for a screen reader ONLY on a tile that isn't
// itself a button — a clickable tile carries an aria-label of its own, and a
// second announcement of "Poker" ahead of it is noise. Hoisted out of the tile
// because the glyph now renders in one of two places (see glyphInMeta) and both
// must make the same call.
function clickableGlyphA11y(clickable: boolean, glyphLabel: string) {
  return clickable
    ? ({ "aria-hidden": true } as const)
    : ({ role: "img", "aria-label": glyphLabel } as const);
}

const FIT_FLOOR_TITLE = 11;
const FIT_FLOOR_SUBTITLE = 9;

function FittedLine({
  variants,
  className,
  style,
  floorPx,
  fullText,
  ariaHidden,
  lineKind,
}: {
  variants: string[];
  className: string;
  style?: React.CSSProperties;
  floorPx: number;
  fullText?: string;
  ariaHidden?: boolean;
  // Stable hook for tests/visual/text-fit.spec.ts, which walks every fitted
  // line on the board and asserts none of them clipped. A class or a text
  // matcher would break the first time either is restyled; this attribute
  // exists only to be found.
  lineKind: "title" | "subtitle";
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // `size: null` = render at the class's own size (the cap). Text starts as the
  // longest variant so the first paint is never SHORTER than what fits — a
  // shrink is invisible, a grow reads as a flicker.
  const [fit, setFit] = useState<{ text: string; size: number | null }>({ text: variants[0] ?? "", size: null });
  // Join, not the array: a fresh array identity every render would re-run the
  // layout effect forever.
  const key = variants.join("\u001F");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const list = key.split("\u001F").filter(Boolean);
    if (!list.length) return;

    const measure = () => {
      const node = ref.current;
      if (!node) return;
      // Clear the inline size BEFORE reading the cap, or each pass would cap
      // itself at the size the previous pass chose and ratchet downward.
      node.style.fontSize = "";
      const cs = getComputedStyle(node);
      const capPx = parseFloat(cs.fontSize) || 14;
      // clientWidth is the room the line actually has: the span is flex-1
      // inside the row, so it fills whatever the glyph slot and gaps leave.
      const avail = node.clientWidth;
      if (!avail) return;

      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;top:-9999px;left:-9999px;";
      probe.style.fontFamily = cs.fontFamily;
      probe.style.fontWeight = cs.fontWeight;
      probe.style.letterSpacing = cs.letterSpacing;
      document.body.appendChild(probe);
      const widthAt = (text: string, px: number) => {
        probe.style.fontSize = `${px}px`;
        probe.textContent = text;
        return probe.offsetWidth;
      };
      let chosen: { text: string; size: number | null } = { text: list[list.length - 1], size: Math.min(capPx, floorPx) };
      outer: for (let px = Math.round(capPx); px >= floorPx; px--) {
        for (const text of list) {
          // 1px of slack: offsetWidth rounds up, and a sub-pixel overflow still
          // trips `truncate` into painting an ellipsis.
          if (widthAt(text, px) <= avail - 1) {
            chosen = { text, size: px >= Math.round(capPx) ? null : px };
            break outer;
          }
        }
      }
      document.body.removeChild(probe);
      // Put the chosen size back on the NODE before yielding, not just in state.
      // `measure` clears node.style.fontSize to read the cap (see above), and
      // React only rewrites that style when `fit` actually changes — so every
      // re-measure that lands on the SAME answer bails out of setFit, renders
      // nothing, and leaves the cleared inline size sitting in the DOM. The line
      // then paints at its natural size and truncates: the exact outcome this
      // component exists to prevent, and it is SELF-INFLICTED, because shrinking
      // the font changes the span's height, which trips the ResizeObserver
      // below, which re-measures and undoes the fit that had just worked.
      // Steady state was "measured a clean 12px fit on every pass, rendered
      // clipped at 14px" — "Triton Super High Roller · Jeju" (Jacob 9/4), and
      // almost certainly the same tail on the Sinquefield Cup and WSOP reports
      // this ladder was written for. Only lines that actually need a step were
      // affected: a `size: null` answer re-clears to the same empty string.
      node.style.fontSize = chosen.size == null ? "" : `${chosen.size}px`;
      setFit((prev) => (prev.text === chosen.text && prev.size === chosen.size ? prev : chosen));
    };

    // rAF for the same reason LeagueColumn's checkIfFullNamesFit uses one:
    // measure off the commit, never synchronously inside the effect body.
    const raf = requestAnimationFrame(measure);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => measure());
    if (ro) ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [key, floorPx]);

  return (
    <span
      ref={ref}
      className={className}
      // `title` keeps the untruncated name reachable on hover even in the
      // last-resort case, exactly as the team/fighter names do.
      title={fullText || variants[0] || undefined}
      aria-hidden={ariaHidden}
      data-fit-line={lineKind}
      style={fit.size == null ? style : { ...style, fontSize: `${fit.size}px` }}
    >
      {fit.text}
    </span>
  );
}

// "Sat 5:00 PM" for a future day, "5:00 PM" if it's today, "Sat" if the time is
// a midnight placeholder (TBD). Mirrors how the game cards show the day for
// upcoming/lookahead games instead of a bare time.
// `refYmd` (YYYYMMDD, the board's viewed date) decides what "today" means: the
// game cards drop the day prefix for games on the VIEWED slate, so an F1/UFC
// tile must too — navigating to Sunday should show the Sunday race as just
// "9:00AM", not "Sun 9:00AM". When absent, falls back to the app's canonical
// service day (getEtServiceDate) — NOT a raw `new Date()` calendar day — so the
// fallback respects the same 1 AM rollover the date nav and data layer use.
// A bare calendar day was the one spot still computing "today" independently,
// the exact UI/data drift etDay.ts's single-source-of-truth exists to prevent:
// between midnight and 1 AM local, the board still shows yesterday's slate, so
// "today" here must be that service day, not the new calendar day.
// `dateOnly` forces the date-only rendering (no clock) even for a non-midnight
// value: boxing.ts anchors every card's `date` to a synthetic noon-UTC
// placeholder (there's no published bout time), which reads as a real "8:00AM"
// here and fabricated a wall-clock for what is a night fight. EventDetailModal
// already special-cases boxing to a date-only "When"; this is the tile-side
// half of that fix so the compact tile stops inventing a time too.
function whenLabel(iso?: string, refYmd?: string, dateOnly?: boolean): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // Show times in the effective time zone (the Settings "Time zone" override,
  // or the device's own zone by default) — same as every game card. Without
  // this, an F1/UFC tile showed kickoff times in the device's zone even when
  // the user had picked another, disagreeing with the cards beside it.
  const tz = getTimeZone();
  // Detect the midnight (TBD) placeholder in the SAME zone the time is shown in
  // (tz), not the device's own zone. Reading d.getHours()/getMinutes() uses the
  // device zone, so a Settings "Time zone" override desyncs it from the
  // displayed time — a real kickoff could be mistaken for a placeholder (or
  // vice-versa). "24:00" guards the value some ICU builds emit for midnight
  // (same guard as weather.ts / etDay.ts / DateNav.ts).
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  const midnight = hm === "00:00" || hm === "24:00";
  // A date-only event (boxing's noon-UTC placeholder) has no real clock, so it
  // renders like the midnight TBD placeholder: bare weekday off-slate, nothing
  // on-slate — never a fabricated time.
  const noTime = midnight || dateOnly;
  // Bucket a REAL kickoff to its SLATE day (etSlateYmd's 1 AM rollover), not a
  // raw effective-tz calendar day, so the "is this on the viewed slate?" test
  // uses the SAME boundary the board, the soccer cards, and the data layer all
  // use. The fallback below already reads the slate-aware service day
  // (getEtServiceDate), so a plain-calendar bucket compared an apples-to-oranges
  // day: a UFC main event at 12:30 AM — which ESPN files on (and the board shows
  // under) the PREVIOUS day's slate — counted as the next calendar day and
  // flashed a spurious "Sun 12:30AM" prefix while the user was viewing that
  // fight's own Saturday slate. Now it just reads "12:30AM", matching a soccer
  // card on the same slate. A midnight (00:00) value is the TBD placeholder, not
  // a real 12 AM start, so it keeps the plain calendar day — otherwise the
  // rollover would push a time-unknown event onto the prior slate and show a
  // stray weekday where the label should be empty. Daytime events (>= 1 AM) are
  // unaffected either way — etSlateYmd and the calendar day agree there.
  const eventYmd = midnight
    ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replace(/-/g, "")
    : etSlateYmd(iso);
  const sameDay = eventYmd === (refYmd || toYmd(getEtServiceDate()));
  // Strip the space before AM/PM so it reads "8:00PM" like the game cards'
  // formatTime (GameCard's "1:10PM"), not "8:00 PM".
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).replace(/(\d)\s+([AP]M)\b/i, "$1$2");
  const wd = d.toLocaleDateString("en-US", { weekday: "short", timeZone: tz });
  if (sameDay) return noTime ? "" : time;
  return noTime ? wd : `${wd} ${time}`;
}

// Rights-holder channels that post per-BOUT UFC highlights, best coverage
// first. Verified against the live YouTube results for UFC Oklahoma City
// (2026-07-19): "UFC on Paramount+" posted a clip for every bout on the card
// (main → prelims) as "<result tag> | A vs. B | UFC Fight Night Mini Fight
// Highlights"; "UFC" posts the marquee bouts; "ESPN MMA" posts one event recap
// ("UFC Fight Night Highlights: A vs. B | ESPN MMA"). Exact author_name strings
// — the worker matches channel identity via oembed, so a wrong string silently
// falls through to the search fallback.
//
// Why strict-only in-app: an unscoped UFC search surfaces titles that give the
// result away outright ("Dricus Du Plessis defeats Kamaru Usman", "… BATTERED
// …" — both on page 1 for this card). So we play ONLY channel-verified uploads
// in the masked player — and when none of the three channels has one, the
// button HIDES itself rather than handing off to a YouTube search (Jacob 7/19).
// That search hand-off was the spoiler hole: those same result titles are the
// thing this whole card exists to keep off screen, so "we couldn't find it"
// beats "here's a page that spoils it". This makes UFC honour the contract
// every other league already had — GameHighlights' "missing" state and
// GolfLeaderboard's visibleHighlightSlots both hide a highlight button whose
// chain came up empty instead of dropping the user on a search page. Racing now
// follows the same fail-closed contract.
// NOTE even the official clips' TITLES carry a partial spoiler ("ROUND 1 SUB",
// "UNANIMOUS DEC"), which the masked player never shows — one more reason the
// native-YouTube-controls option stays off (it would surface the title).
const UFC_HIGHLIGHT_CHANNELS = ["UFC on Paramount+", "UFC", "ESPN MMA"] as const;

// What the play button reports once a bout has been resolved: the channel it
// actually came from. Keyed by bout id so each card says where ITS video came
// from; a null entry (not this type) means no rights-holder had the clip.
export type HighlightSource = { label: string; official: boolean; videoId?: string; fallbackUrl?: string };

// "A vs B highlights" — deliberately WITHOUT the "UFC" token that espn.ts's
// generic highlightQuery adds. Measured against the live resolver 2026-07-19:
// "Chase Hooper vs Mitch Ramirez UFC highlights" returned nothing, while the
// same query minus "UFC" resolved the rights-holder clip, as did every other
// bout tried — the extra token reorders YouTube's results enough that the
// worker's matcher stops finding a qualifying video. The channel gate (not the
// query text) is what keeps the result on-brand here.
function boutHighlightQuery(fight: FightBout): string {
  return `${fight.red.name} vs ${fight.blue.name} highlights`;
}

function useHighlightPlayer(onPlayHighlight?: (videoId: string, fallbackUrl: string) => void) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Racing is strict and fail-closed: the worker verifies the uploader and race,
  // and a miss returns null so the caller hides the button. The fallback URL is
  // retained only as private retry metadata for VideoModal; it carries the same
  // channel/race gates and is never opened as a generic search result.
  const playRace = async (id: string, query: string, channel: string, label: string, raceTokens?: string[]): Promise<HighlightSource | null> => {
    // nss_channels/nss_strict ride along so VideoModal's embed-failure retry
    // keeps THIS call's channel gate. FOM blocks the FORMULA 1 embed often, and
    // an ungated retry is what put a fan reupload in the masked player (7/19);
    // YouTube ignores the extra params; inside HideScore they are private retry
    // metadata, while the modal's external handoff uses the resolved watch URL.
    const gate = `&nss_strict=1&nss_channels=${encodeURIComponent(channel)}`
      // nss_race rides along for the same reason nss_channels does: VideoModal's
      // embed-failure retry must keep THIS call's race gate, or an FOM embed
      // block on the F1 reel would retry ungated and put a different round's
      // race in the masked player.
      + (raceTokens?.length ? `&nss_race=${encodeURIComponent(raceTokens.join("|"))}` : "");
    const fallback = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${gate}`;
    if (!onPlayHighlight) return null;
    setLoadingId(id);
    try {
      const videoId = await fetchFirstVideoId(query, channel, undefined, undefined, true, raceTokens);
      if (!videoId) return null;
      onPlayHighlight(videoId, fallback);
      return { label, official: true, videoId, fallbackUrl: fallback };
    } finally {
      setLoadingId(null);
    }
  };

  // UFC: walk the rights-holder channels in coverage order, each strict
  // (channel-verified), and play the first hit in the masked player. Returns
  // which source won so the button can report it, or NULL when no channel has
  // a verified clip — the caller hides the button on null (see the spoiler note
  // on UFC_HIGHLIGHT_CHANNELS; there is deliberately no search fallback here).
  // Sequential on purpose: the worker scrapes YouTube's results page and gets
  // rate-limited into empty responses under bursts (measured 2026-07-19), so a
  // second channel is only ever tried when the first genuinely missed.
  const playUfc = async (id: string, query: string): Promise<HighlightSource | null> => {
    if (!onPlayHighlight) return null;
    setLoadingId(id);
    try {
      for (const channel of UFC_HIGHLIGHT_CHANNELS) {
        const videoId = await fetchFirstVideoId(query, channel, undefined, undefined, true);
        if (videoId) {
          // The modal's "Watch on YouTube" fallback is this EXACT clip's watch
          // page, never a /results search — an embed block must not become the
          // spoiler surface the strict gate just avoided.
          //
          // nss_strict/nss_channels ride along the way racing's do. They are not
          // decoration here: VideoModal derives its ALWAYS-ON title mask from
          // exactly these params (strictFallbackChannels → channelAlwaysMasksTitle),
          // so a bare watch URL left every UFC clip falling back to the generic
          // SPOILER_RX check — which is the check the 8/10 combat-sports commit
          // concluded can never be trusted on a fight title. That is why the
          // masking shipped and the titles still leaked (Jacob 8/11). YouTube
          // ignores the extra params; inside HideScore they are private metadata.
          onPlayHighlight(
            videoId,
            `https://www.youtube.com/watch?v=${videoId}&nss_strict=1&nss_channels=${encodeURIComponent(channel)}`,
          );
          // "UFC on Paramount+" → "Paramount+" on the button (the channel name
          // repeats the league label the button already sits under).
          return { label: channel.replace(/^UFC on /, ""), official: true, videoId };
        }
      }
    } finally {
      setLoadingId(null);
    }
    return null;
  };

  // Single-event strict resolver for poker majors. Poker result pages and
  // unscoped YouTube results routinely put the champion in the headline, so a
  // miss must return null and hide the button — never open a search page. The
  // exact tour channel comes from the source-validated major-events record.
  const playStrictOnly = async (id: string, query: string, channel: string, label: string): Promise<HighlightSource | null> => {
    if (!onPlayHighlight) return null;
    setLoadingId(id);
    try {
      const videoId = await fetchFirstVideoId(query, channel, undefined, undefined, true);
      if (!videoId) return null;
      onPlayHighlight(videoId, `https://www.youtube.com/watch?v=${videoId}`);
      return { label, official: true, videoId };
    } finally {
      setLoadingId(null);
    }
  };

  return { loadingId, playRace, playUfc, playStrictOnly };
}

// Play button styled exactly like the game cards' highlight buttons
// (GameHighlights): bg-card-hover pill, accent play triangle + label.
// `note` is a muted visual tail on the label ("(Opens YouTube)") for a channel
// that refuses embeds, so the hand-off out of the app is stated BEFORE the tap
// rather than discovered as a surprise card (Jacob 8/11, F1). It is written
// short on a narrow column and spelled out on a wide one; `hint` carries the
// full sentence to the accessible name either way, so what a screen reader
// hears never depends on the column width.
function PlayBtn({ label, loading, onClick, note, hint }: { label: string; loading: boolean; onClick: () => void; note?: string; hint?: string }) {
  return (
    <button
      type="button"
      // stopPropagation: the F1 tile body is clickable (opens the ESPN race
      // page), so the play button must not ALSO trigger the card's click —
      // same pattern as every nested button in GameCard.
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={loading}
      className="highlight-btn flex items-center justify-center gap-1 py-1.5 rounded-md flex-1 transition-opacity hover:opacity-80 cursor-pointer disabled:opacity-50"
      style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
      title={`${label} highlights${hint ? ` — ${hint}` : ""}`}
      // Pin the accessible name to the button's purpose so a screen reader
      // hears "UFC highlights" / "Search highlights" — otherwise the name fell
      // back to the bare visible text ("Search" alone is ambiguous) while
      // loading swapped it to "Loading…", losing what the button does. aria-busy
      // conveys the in-flight fetch that the visible "Loading…" shows sighted
      // users. Matches the title+aria-label pairing every other button here uses.
      aria-label={`${label} highlights${hint ? ` — ${hint}` : ""}`}
      aria-busy={loading}
    >
      {loading ? (
        <span className="text-[10px]">Loading…</span>
      ) : (
        <>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
          <span className="text-[10px] font-medium truncate min-w-0">{label}</span>
          {note && (
            // aria-hidden: the same fact is already in the button's aria-label,
            // spelled out in full — announcing an "↗" as well would be noise.
            <span aria-hidden="true" className="text-[10px] font-normal shrink-0" style={{ color: "var(--text-muted)" }}>{note}</span>
          )}
        </>
      )}
    </button>
  );
}

// Tiered fighter names, following the golf leaderboard's precedent exactly:
// full ("Kamaru Usman") when the longest name on the card fits, else the ESPN
// short name ("K. Usman"), else — desktop only — last name alone ("Usman").
// On mobile never drop the first-name initial (golf's rule: it's load-bearing
// for recognition; below that, rely on truncate).
export type FighterNameTier = "full" | "short" | "last";

// Drop the first-name initial from "D. Du Plessis" → "Du Plessis" (same helper
// as GolfLeaderboard's lastNameOnly).
function lastNameOnly(shortName: string): string {
  return shortName.split(". ").pop() ?? shortName;
}

function fighterLabel(f: FightBout["red"], tier: FighterNameTier): string {
  if (tier === "full" || !f.shortName) return f.name;
  return tier === "short" ? f.shortName : lastNameOnly(f.shortName);
}

function FighterRow({ f, compact, nameTier, showRecord }: { f: FightBout["red"]; compact: boolean; nameTier: FighterNameTier; showRecord: boolean }) {
  return (
    // min-h-6: a game card's team row is 24px tall at EVERY width — its
    // team-name-container is a full line box (16px/24px root line-height) even
    // when the mobile logo is only 16px. Fighter rows have no such container,
    // so without this they collapsed to the 16px flag on phones and every UFC
    // card ran 16px shorter than the MLB card beside it — the columns visibly
    // drifted apart as they stacked (Jacob 7/18).
    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 min-h-6">
      {f.flag ? (
        // onError hides a 404'd/blocked remote flag so it degrades to the empty
        // slot instead of the browser's broken-image glyph — matches the onError
        // guards on every other remote flag/logo in the app (GameCard,
        // GolfLeaderboard, WorldCupGroupsModal/Bracket, NewsColumn, …).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.flag} alt={f.country ?? ""} title={f.country} loading="lazy" decoding="async" width={24} height={24} className="w-4 h-4 sm:w-6 sm:h-6 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
      ) : (
        <span className="w-4 h-4 sm:w-6 sm:h-6 shrink-0" />
      )}
      {/* Mirror the game cards' team-name classes exactly: abbreviated team
          names render text-xs sm:text-sm, full names text-sm (GameCard). Fighter
          names can't abbreviate, so compact mirrors only the SIZE — including
          the sm: step, so on a desktop board whose game columns abbreviate at
          14px the fighter names are 14px too, not a mismatched 12px. The full
          branch keeps .team-name so single-column large mode scales it to 1rem
          alongside the team names (abbreviations don't carry it in GameCard
          either). */}
      <span className={`${compact ? "text-xs sm:text-sm" : "text-sm team-name"} leading-none truncate min-w-0`} style={{ color: "var(--text)" }} title={f.name}>{fighterLabel(f, nameTier)}</span>
      <span className="flex-1 min-w-0" />
      {showRecord && f.record && (
        <span className="text-[10px] sm:text-xs tabular-nums text-right whitespace-nowrap shrink-0 leading-none" style={{ color: "var(--text-muted)" }}>{f.record}</span>
      )}
    </div>
  );
}

function FightCard({
  fight, label, showLabel, broadcasts, showBroadcast, loadingId, onPlay, source, compact, metaCompact, nameTier, showRecords, selectedDate, hideMeta, onShowDetails, defaultPlayLabel,
}: {
  fight: FightBout;
  label?: string;
  // false when the meta row can't fit status + pill + broadcast on ONE line —
  // the pill is what gives way (Jacob 7/19: "maybe main and comain dont show
  // if no space"), keeping every card's meta to a single line on phones.
  showLabel: boolean;
  // false only when status + channel can't share one line either (~108px card).
  showBroadcast: boolean;
  broadcasts: string[];
  loadingId: string | null;
  onPlay: (id: string, query: string, channel?: string) => void;
  // Resolved source for THIS bout once played ("Paramount+" / "UFC" / "ESPN
  // MMA"), so each card reports where its video actually came from. null =
  // resolved and nothing official has it → the button is hidden (no search
  // fallback). undefined = not attempted yet.
  source?: HighlightSource | null;
  compact: boolean;
  metaCompact: boolean;
  nameTier: FighterNameTier;
  showRecords: boolean;
  selectedDate?: string;
  hideMeta: boolean;
  // Opens the bout's detail sheet — the affordance every SCORE card has had
  // and no event card did (Jacob 8/11: "nothing happens when i click the fight
  // card"). Absent = inert, so a board that doesn't pass a handler is
  // unchanged rather than clickable-but-dead.
  onShowDetails?: () => void;
  // What the play button says BEFORE a source is resolved. See the note at the
  // call site: it's the event's own broadcaster, not a guess at the channel.
  defaultPlayLabel: string;
}) {
  const isLive = fight.state === "in";
  const isPost = fight.state === "post";
  // "Live" is a WORD in the narrowest slot on the card, and the dot beside it
  // already carries the meaning — so on a 3-up mobile board the word was
  // spending ~24px to say what the green dot says for free, and the fighter
  // names paid for it (Jacob 8/11: "maybe just a green dot instead of 'Live'").
  // The dot is decorative, so the state stays reachable to assistive tech
  // through the sr-only text below.
  const status = isPost ? "Final" : isLive ? "" : whenLabel(fight.date, selectedDate) || fight.statusDetail;
  const clickable = !!onShowDetails;
  return (
    <div className={`ns-card-focus rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative${clickable ? " cursor-pointer" : ""}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      onClick={onShowDetails}
      // Guard on e.target === e.currentTarget, as GameCard's card-level key
      // handler does: without it, Space/Enter on the nested play button would
      // ALSO pop the detail sheet on top of the video the user just started.
      onKeyDown={clickable ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onShowDetails!(); } } : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${fight.red.name} vs ${fight.blue.name} — event details` : undefined}>
      {/* Status bar — the game cards' meta row verbatim (GameCard ~640):
          game-meta-row + text-xs fonts (10px on tight boards via CSS), flex-wrap
          + gap-x-1, shrink-0 time, ml-auto broadcast. The broadcast is ALWAYS
          rendered — like MLB's network, which never disappears; when a narrow
          column can't hold "8:00PM  CO-MAIN  Paramount+" on one line, the
          broadcast WRAPS to its own right-pinned line instead of being dropped
          or overlapped (the exact "wrap, don't clip" rule the game cards adopted
          6/9 for wide networks — a metaCompact cutoff that hid it read as
          "missing channel", Jacob 7/18). The Main/Co-Main pill slot is flex-auto
          WITHOUT min-w-0 so the nowrap pill wraps as a unit when it can't fit
          beside the time, never overlapping it; the weight-class slot keeps
          min-w-0 + truncate (shrinks in place) and drops entirely on columns too
          narrow to show a useful amount of it. */}
      {!hideMeta && <div className="game-meta-row relative flex flex-wrap items-center mb-1 sm:mb-2 text-xs min-h-[18px] gap-x-1 gap-y-0.5 sm:gap-x-1.5">
        <span className="shrink-0 whitespace-nowrap flex items-center gap-1" style={{ color: isLive ? "#16a34a" : "var(--text-muted)" }}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />}
          {isLive && <span className="sr-only">Live</span>}
          {status}
        </span>
        {label && showLabel ? (
          <span className="flex-auto flex justify-center">
            <span className="inline-flex items-center rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
              style={{ color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 15%, transparent)" }}>
              {label}
            </span>
          </span>
        ) : !label && !metaCompact && fight.weightClass ? (
          <span className="flex-auto flex justify-center min-w-0">
            <span className="truncate" style={{ color: "var(--text-muted)" }}>{fight.weightClass}</span>
          </span>
        ) : null}
        {broadcasts.length > 0 && showBroadcast && (
          <span className="shrink-0 ml-auto" style={{ color: "var(--text-muted)" }}>{broadcasts[0]}</span>
        )}
      </div>}
      <div className="flex flex-col gap-y-0.5">
        <FighterRow f={fight.red} compact={compact} nameTier={nameTier} showRecord={showRecords} />
        <FighterRow f={fight.blue} compact={compact} nameTier={nameTier} showRecord={showRecords} />
      </div>
      {/* source === null → resolved, and no rights-holder channel has this
          bout's clip. Still no YouTube search — those result titles spoil the
          finish (see the UFC_HIGHLIGHT_CHANNELS note) — but the row does NOT
          vanish either. Unlike a game card, a bout resolves on TAP, not on
          render, so the button is speculative until pressed; deleting it on a
          miss meant an undercard fight "said it had a link and then it
          disappeared" (Jacob 8/11) with nothing to show for the tap. Saying so
          keeps the answer where the question was asked, and costs no height
          that the button was not already occupying.
          undefined → not attempted yet, so the button shows. */}
      {/* .hl-slot: the board-wide height floor shared with GameCard (see
          globals.css). A bout already keeps its row once played, so this mostly
          lets a resolved bout COUNT as a card with a button for the floor. */}
      <div className={isPost ? "hl-slot" : undefined}>
      {isPost && source === null && (
        <div className="mt-1 sm:mt-2 flex gap-1">
          <p role="status" className="flex-1 text-center text-[10px] py-1.5" style={{ color: "var(--text-muted)" }}>
            No highlight yet
          </p>
        </div>
      )}
      {isPost && source !== null && (
        <div className="mt-1 sm:mt-2 flex gap-1">
          {/* Label reports the SOURCE once resolved — "Paramount+" / "UFC" /
              "ESPN MMA" once the rights-holder clip played in-app. Before that
              it reports the event's OWN broadcaster (defaultPlayLabel), which
              is ESPN's field, not a guess at which channel will win the chain —
              so the strict gate's "never claim an unverified source" rule still
              holds. The old fallback was a bare "UFC" that flipped to
              "Paramount+" the moment you pressed it, which read as the label
              being wrong until you clicked (Jacob 8/11). It can no longer read
              "Search" — that path is gone. */}
          <PlayBtn label={source?.label ?? defaultPlayLabel} loading={loadingId === fight.id} onClick={() => onPlay(fight.id, boutHighlightQuery(fight), "UFC")} />
        </div>
      )}
      </div>
    </div>
  );
}

export default function EventCard({
  event,
  onPlayHighlight,
  onShowDetails,
  namesCompact,
  selectedDate,
  isPastDate,
}: {
  event: LeagueEventCard;
  leagueLabel?: string;
  onPlayHighlight?: (videoId: string, fallbackUrl: string) => void;
  // Opens the event's detail sheet (EventDetailModal). `fight` is set when a
  // single UFC bout card was tapped, so the sheet can lead with that bout.
  // Absent = the tiles stay inert, as they were before.
  onShowDetails?: (event: LeagueEventCard, fight?: FightBout) => void;
  // The board-level "game columns are showing abbreviated team names" signal
  // (HomeContent folds it from every game column's live useAbbreviations state).
  namesCompact?: boolean;
  // The board's viewed date (YYYYMMDD) — whenLabel drops the day prefix for an
  // event ON this date, matching how game cards show a bare time for the
  // viewed slate.
  selectedDate?: string;
  isPastDate?: boolean;
}) {
  const { loadingId, playRace, playUfc, playStrictOnly } = useHighlightPlayer(onPlayHighlight);
  // Where each bout's highlight actually came from, once played (bout id →
  // source). Sticky per card so the button keeps reporting its source. A NULL
  // entry means "resolved, and no rights-holder has it" — FightCard hides that
  // bout's button from then on instead of offering a YouTube search. Absent
  // (undefined) = not attempted yet, so the button still shows as plain "UFC".
  const [sources, setSources] = useState<Record<string, HighlightSource | null>>({});
  // The single poker tile has one tour-gated replay. undefined = untried,
  // object = resolved, null = no official upload (button hides).
  const [pokerSource, setPokerSource] = useState<HighlightSource | null | undefined>(undefined);
  // Boxing majors use the same strict, fail-closed source contract as Poker,
  // but stay separate so a promoter mapping cannot affect another event type.
  const [boxingSource, setBoxingSource] = useState<HighlightSource | null | undefined>(undefined);
  // Racing mirrors Poker/Boxing: undefined = untried, object = verified source,
  // null = strict miss (button hidden; no YouTube-search handoff).
  const [raceSource, setRaceSource] = useState<HighlightSource | null | undefined>(undefined);
  // Chess is the same contract again. What it plays is the organizer's ROUND
  // BROADCAST, not a highlight package — no chess body publishes one (see
  // CHESS_ORGANIZER_CHANNELS in lib/espn.ts) — so the button says "Round".
  const [chessSource, setChessSource] = useState<HighlightSource | null | undefined>(undefined);
  // A replay carried onto a later slate should not retain a redundant FINAL
  // row above its watch button. Normal finished GameCards also drop that row
  // on past dates. Apply the same rule to every event-card family (UFC,
  // racing, boxing, chess, poker), including a recent event shown on Today.
  const historicalPost = (state: LeagueEventCard["state"], date: string) => {
    if (state !== "post") return false;
    if (isPastDate) return true;
    if (!selectedDate) return false;
    // Bucket the finished event to its SLATE day (etSlateYmd's 1 AM rollover),
    // not a raw effective-tz calendar day, so "is this a replay carried onto a
    // later slate?" uses the SAME boundary the board, whenLabel above, and the
    // data layer all use. A UFC main event at 12:30 AM ET is filed on (and the
    // board shows it under) the PREVIOUS day's slate; the old calendar-day bucket
    // counted it as the NEXT day, so on that following slate eventYmd === selectedDate
    // and the redundant FINAL row wrongly stayed. etSlateYmd returns "" for an
    // unparseable date — treat that as "not historical" (keep the row) rather than
    // letting "" sort before selectedDate. Daytime events (>= 1 AM local) are
    // unaffected: etSlateYmd and the calendar day agree there.
    const eventYmd = etSlateYmd(date);
    if (!eventYmd) return false;
    return eventYmd < selectedDate;
  };
  const playBout = async (id: string, query: string) => {
    // Already resolved this bout — replay the same video instead of walking the
    // channel chain again. The resolver scrapes YouTube's results page and
    // rate-limits into empty responses under load (measured 2026-07-19), so
    // re-watching a highlight must not cost another 1-3 lookups.
    const known = sources[id];
    if (known?.videoId && onPlayHighlight) {
      onPlayHighlight(known.videoId, `https://www.youtube.com/watch?v=${known.videoId}`);
      return;
    }
    const src = await playUfc(id, query);
    setSources((prev) => ({ ...prev, [id]: src }));
  };
  const playPoker = async () => {
    if (!event.officialChannel) return;
    if (pokerSource?.videoId && onPlayHighlight) {
      onPlayHighlight(pokerSource.videoId, `https://www.youtube.com/watch?v=${pokerSource.videoId}`);
      return;
    }
    const src = await playStrictOnly(
      "poker-official",
      event.highlightQuery ?? `${event.title} highlights`,
      event.officialChannel,
      event.officialLabel ?? "Poker",
    );
    setPokerSource(src);
  };
  const playBoxing = async () => {
    if (!event.officialChannel) return;
    if (boxingSource?.videoId && onPlayHighlight) {
      onPlayHighlight(boxingSource.videoId, `https://www.youtube.com/watch?v=${boxingSource.videoId}`);
      return;
    }
    // playRace, not playStrictOnly, for the same reason chess uses it: one
    // promoter channel covers every card they run, so the strict channel gate
    // alone cannot tell two fight nights apart. `raceTokens` carries the
    // fighters' surnames (buildBoxingTokens) — undefined on the curated file's
    // entries, where the hand-written full-name query already does the work, and
    // playRace with no tokens is playStrictOnly.
    const src = await playRace(
      "boxing-official",
      event.highlightQuery ?? `${event.title} highlights`,
      event.officialChannel,
      event.officialLabel ?? "Boxing",
      event.raceTokens,
    );
    setBoxingSource(src);
  };
  const playRaceHighlight = async () => {
    if (!event.officialChannel) {
      setRaceSource(null);
      return;
    }
    if (raceSource?.videoId && onPlayHighlight) {
      onPlayHighlight(
        raceSource.videoId,
        raceSource.fallbackUrl ?? `https://www.youtube.com/watch?v=${raceSource.videoId}`,
      );
      return;
    }
    const src = await playRace(
      "race-official",
      f1Query,
      event.officialChannel,
      event.officialLabel ?? "Racing",
      event.raceTokens,
    );
    setRaceSource(src);
  };
  // Chess reuses playRace verbatim: same strict channel gate, same title-token
  // gate (`raceTokens` carries the tournament name here — the worker's `race`
  // param is a generic "title must contain one of these", named for its first
  // caller). One organizer channel covers a whole season, so without the token
  // the tile would play whichever event that channel uploaded last.
  const playChessRound = async () => {
    if (!event.officialChannel) {
      setChessSource(null);
      return;
    }
    if (chessSource?.videoId && onPlayHighlight) {
      onPlayHighlight(
        chessSource.videoId,
        chessSource.fallbackUrl ?? `https://www.youtube.com/watch?v=${chessSource.videoId}`,
      );
      return;
    }
    const src = await playRace(
      "chess-official",
      event.highlightQuery ?? event.title,
      event.officialChannel,
      event.officialLabel ?? "Round",
      event.raceTokens,
    );
    setChessSource(src);
  };

  // Fighter-name size follows namesCompact — the game columns' REAL
  // abbreviate/full flip. That flip depends on the day's longest team name (and
  // the board's gap/rank CSS), so a width threshold here can only ever guess it:
  // the shipped 155px guess was measured on one day's slate and drifted the
  // very next day (MLB still abbreviated at 157px columns while fighter names
  // had already expanded — "UFC bigger"). The width fallback below survives
  // only for a board with no game columns to report (UFC-only), where there's
  // nothing to match anyway. metaCompact stays width-driven on purpose: whether
  // a weight class is worth showing is a property of THIS card's strings, not
  // of the neighbours' team names.
  const rootRef = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(0);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setColWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = namesCompact ?? (colWidth > 0 && colWidth < 155);
  // metaCompact now gates ONLY the weight class (time/pill/broadcast handle
  // narrow columns by wrapping/shrinking, see the meta-row comment): below
  // ~210px "8:00PM … Lightweight … Paramount+" leaves so little center room
  // that the weight class truncated to fragments ("Ligh…") — drop it instead.
  // colWidth 0 = not yet measured — start without it (no flash of fragments).
  const metaCompact = colWidth < 210;

  // Fighter-name tier — the golf leaderboard's probe-measure pattern verbatim:
  // pick the longest tier (full → "K. Usman" → "Usman") whose LONGEST name on
  // the card fits the room a fighter row actually has (column minus card
  // padding, flag, gaps, and the widest record). One tier for the whole card,
  // like golf's one tier per leaderboard and MLB's one abbreviation state per
  // column — mixed formats within a column read as a bug. On mobile never drop
  // below the ESPN short name (golf's rule: the first-name initial is
  // load-bearing for recognition; below that, truncate is the safety net).
  const fights = event.kind === "ufc" ? event.fights : undefined;
  const [nameFit, setNameFit] = useState<{ tier: FighterNameTier; records: boolean }>({ tier: "full", records: true });
  // Does the meta row hold status + Main/Co-Main pill + broadcast on ONE line?
  // If not the PILL gives way (Jacob 7/19) — the channel and the time both stay,
  // so no card ever grows a second meta line on a phone. Measured, not guessed:
  // the pill's width depends on the label text at 10px semibold uppercase plus
  // its rounded-full padding.
  const [metaFit, setMetaFit] = useState<{ pill: boolean; broadcast: boolean }>({ pill: true, broadcast: true });
  useEffect(() => {
    if (!fights?.length || !colWidth) return;
    // rAF, matching LeagueColumn's checkIfFullNamesFit: measurement runs off
    // the commit (no sync setState in the effect body / no layout thrash).
    const raf = requestAnimationFrame(() => {
      const isMobile = window.innerWidth < 640; // sm breakpoint, as in GolfLeaderboard
      const nameFs = compact && isMobile ? 12 : 14; // text-xs sm:text-sm vs text-sm
      const recFs = isMobile ? 10 : 12; // record: text-[10px] sm:text-xs
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font-family:inherit;";
      document.body.appendChild(probe);
      const maxW = (texts: string[], fs: number) => {
        probe.style.fontSize = `${fs}px`;
        let max = 0;
        for (const t of texts) {
          probe.textContent = t;
          if (probe.offsetWidth > max) max = probe.offsetWidth;
        }
        return max;
      };
      const all = fights.flatMap((f) => [f.red, f.blue]);
      const recordW = maxW(all.map((f) => f.record).filter(Boolean), recFs);
      const cardPadding = isMobile ? 16 : 32; // px-2 vs sm:px-4
      const flagW = isMobile ? 16 : 24; // w-4 vs sm:w-6
      const gaps = 3 * (isMobile ? 4 : 6); // gap-1 vs sm:gap-1.5, flag|name|spacer|record
      const availWith = colWidth - cardPadding - flagW - recordW - gaps - 4; // 4px safety
      const availWithout = colWidth - cardPadding - flagW - gaps - 4;
      const fullMax = maxW(all.map((f) => f.name), nameFs);
      const shortMax = maxW(all.map((f) => f.shortName || f.name), nameFs);

      // Meta row: status (widest of the card's time/Final labels) + the widest
      // pill ("CO-MAIN") + the broadcast, at the meta font (10px on the tight
      // board, else 12px — .ns-board-tight/text-xs). The pill adds its own
      // padding (px-1.5 mobile / px-2 desktop, both sides) and letter-spacing.
      // Read the meta row's ACTUAL font size off the DOM rather than inferring
      // it: .ns-board-tight drops this row to 10px based on the COLUMN COUNT,
      // not the column width, so a width heuristic said 10px on a 108px 2-column
      // card that was really rendering 12px — and the row wrapped anyway.
      const metaEl = rootRef.current?.querySelector(".game-meta-row");
      const metaFs = metaEl ? parseFloat(getComputedStyle(metaEl).fontSize) || 12 : 12;
      // Measure the live state as "" to match what FightCard actually renders: a
      // live bout shows only the green dot, not the word "Live" (see the `isLive
      // ? ""` status above). Measuring it as "Live" over-reserved ~24px of the
      // status slot for text that never paints, which could drop the Main/Co-Main
      // pill or the broadcaster one column-width sooner than necessary.
      const statusMax = maxW(fights.map((f) => f.state === "post" ? "Final" : f.state === "in" ? "" : whenLabel(f.date, selectedDate) || f.statusDetail), metaFs);
      probe.style.fontWeight = "600";
      probe.style.textTransform = "uppercase";
      probe.style.letterSpacing = "0.025em";
      const pillText = maxW(["Co-Main"], 10);
      probe.style.fontWeight = "";
      probe.style.textTransform = "";
      probe.style.letterSpacing = "";
      const pillW = pillText + (isMobile ? 12 : 16);
      const bcW = event.broadcasts.length ? maxW([event.broadcasts[0]], metaFs) : 0;
      // `probe.remove()`, not `document.body.removeChild(probe)`: this runs in a
      // bare rAF (no try/catch), so an uncaught throw here reaches Sentry. If the
      // DOM has been reparented out from under us — a page-translation extension
      // is the common cause — removeChild throws "NotFoundError: The object can
      // not be found here." because the probe is no longer a direct child of
      // <body>; remove() detaches it from wherever it sits (or no-ops) and never
      // throws. Matches the sibling probe above (widthAt) and the other
      // measurement probes across the app.
      probe.remove();
      const metaGaps = isMobile ? 4 : 6; // gap-x-1 / sm:gap-x-1.5
      const metaAvail = colWidth - cardPadding - 2;
      // Ladder — always ONE line, never a wrap (Jacob 7/19: a card that grew a
      // second meta line on mobile). The pill goes first, then, only if status +
      // channel STILL don't fit (3 columns on a small phone ≈ 108px of card),
      // the channel — a per-card repeat of one event-wide fact, so it's the
      // cheapest thing left to lose once the pill is already gone.
      setMetaFit({
        pill: statusMax + pillW + bcW + 2 * metaGaps <= metaAvail,
        broadcast: statusMax + bcW + metaGaps <= metaAvail,
      });
      // Priority ladder: full+records → short+records → short WITHOUT records
      // (the record is the least load-bearing field — same call as the tight
      // board hiding MLB's #rank chips — but only hide it when that's what
      // makes the short name fit) → desktop last-name-only → short+records
      // with truncate as the last-resort safety net.
      if (fullMax <= availWith) setNameFit({ tier: "full", records: true });
      else if (shortMax <= availWith) setNameFit({ tier: "short", records: true });
      else if (shortMax <= availWithout) setNameFit({ tier: "short", records: false });
      else if (!isMobile && maxW(all.map((f) => lastNameOnly(f.shortName || f.name)), nameFs) <= availWith) setNameFit({ tier: "last", records: true });
      // Ultra-narrow last resort: the short name doesn't fit even alone — give
      // the name every pixel (records are the least load-bearing field) and let
      // truncate absorb the remainder, rather than hard-truncating beside a
      // record ("D. Du…  24-3-0").
      else setNameFit({ tier: "short", records: false });
    });
    return () => cancelAnimationFrame(raf);
  }, [fights, compact, colWidth, event.broadcasts, selectedDate]);

  // ── UFC: one card per bout, main event first ──
  if (event.kind === "ufc" && event.fights?.length) {
    return (
      <div ref={rootRef} className="flex flex-col gap-1.5 sm:gap-2">
        {event.fights.map((f, i) => (
          <FightCard
            key={f.id}
            fight={f}
            label={i === 0 ? "Main" : i === 1 ? "Co-Main" : undefined}
            showLabel={metaFit.pill}
            showBroadcast={metaFit.broadcast}
            broadcasts={event.broadcasts}
            loadingId={loadingId}
            onPlay={playBout}
            source={sources[f.id]}
            compact={compact}
            metaCompact={metaCompact}
            nameTier={nameFit.tier}
            showRecords={nameFit.records}
            selectedDate={selectedDate}
            hideMeta={historicalPost(f.state, f.date)}
            onShowDetails={onShowDetails ? () => onShowDetails(event, f) : undefined}
            // ESPN's own broadcaster for the card ("Paramount+"), so the button
            // names a real, verified source before the channel chain has run.
            // Falls back to the league token when the feed carries no
            // broadcast — never to a channel we haven't resolved.
            defaultPlayLabel={event.broadcasts[0] || "UFC"}
          />
        ))}
      </div>
    );
  }

  // ── Single-event tile — races, boxing, chess, and poker majors ──
  // One layout, four glyphs. Boxing/chess/poker reuse the race tile because the
  // shape is identical (one headline event, a venue subtitle, a status) and it
  // is already height-matched to an MLB card at every breakpoint; a bespoke
  // layout would drift out of alignment the first time either was touched.
  const isRace = event.kind === "f1";
  // Longest-first renderings for the two text rows. The feed supplies these for
  // racing (lib/eventTiles.ts); boxing, chess and poker have only the one
  // string so far, and still get the font step — which is what was clipping
  // "Sinquefield Cup" and the WSOP event names (Jacob 8/10). The   keeps a
  // subtitle-less tile's second row a real line box, as the literal did before.
  const titleVariants = event.titleVariants?.length ? event.titleVariants : [event.title];
  const subtitleVariants = event.subtitleVariants?.length
    ? event.subtitleVariants
    : [event.subtitle || " "];
  const glyph = event.kind === "boxing" ? "🥊" : event.kind === "chess" ? "♟️" : event.kind === "poker" ? "♠️" : "🏁";
  // Spoken name for the sport-type glyph, announced via role="img"/aria-label on
  // a NON-clickable tile, where the tile root carries no aria-label and the
  // emoji is otherwise the only cue to the event type. Mirrors `glyph`'s
  // boxing/chess/poker/race branches so poker reads "Poker", not "Race".
  // (Every tile is clickable now that the detail sheet exists, so this is a
  // belt-and-braces path — it still fires if a caller omits onShowDetails.)
  const glyphLabel = event.kind === "boxing" ? "Boxing" : event.kind === "chess" ? "Chess" : event.kind === "poker" ? "Poker" : "Race";
  const glyphA11y = clickableGlyphA11y(!!onShowDetails, glyphLabel);
  const isLive = event.state === "in";
  const isPost = event.state === "post";
  // A PAST board is a settled board: every game card on it is finished, has
  // already dropped its status row (GameCard's showBar) and has already taken
  // the .hl-slot reserve. An event tile there has to do BOTH or it cannot line
  // up — a multi-day major still LIVE (Triton Jeju, Sep 4-17) kept its 26px
  // meta row AND skipped the 36px reserve, which is exactly the 10px the poker
  // tile came up short beside the MLB cards on /yesterday (measured on prod
  // 9/6: poker 102.67, MLB/EPL/US Open 112.67). Doing only one of the two
  // overshoots by 26px the other way. Cost, accepted by Jacob: a live event
  // tile shows no green dot on a PAST board — the same trade the game cards
  // made when they stopped printing FINAL there. Today/future is untouched.
  const hideHistoricalMeta = isPastDate || historicalPost(event.state, event.date);
  // Where the sport glyph renders. Normally the meta row, which frees the 30px
  // logo slot on both text rows below; a historical finished tile has no meta
  // row at all, so it falls back to the title row it has always used.
  const glyphInMeta = !hideHistoricalMeta;
  // Status text mirrors FightCard/the game cards exactly: "Final" / "Live" /
  // whenLabel ("Sat 9:00AM" for another day, bare "9:00AM" when the race is on
  // the viewed date — selectedDate — same rule as the game cards' time).
  // "Live" gives way to the green dot for the same reason it does on a fight
  // card — the word is the widest thing in the tightest slot, and the dot
  // already says it. The state stays announced via the sr-only text below.
  const status = isPost
    ? "Final"
    : isLive
      ? ""
      : event.kind === "poker" && event.scheduleLabel
        ? event.scheduleLabel
        : whenLabel(event.date, selectedDate, event.kind === "boxing") || event.statusDetail;
  const f1Query = event.highlightQuery ?? `${event.title} highlights`;
  // Clicking the tile body opens the detail SHEET, not ESPN. It used to open
  // ESPN's race page directly, which meant only a pre/live race with an
  // eventUrl responded to a tap at all — a finished WSOP, chess or boxing tile
  // was dead, and its clipped title had nowhere to be read in full (Jacob
  // 8/11: "wsop card cant click", "f1 cant click card"). The sheet answers
  // every tile, and keeps the spoiler rule by carrying the ESPN button only
  // while the event is pre/live (see showExternal in EventDetailModal) — a
  // finished race's ESPN page still prints the finishing order.
  // PlayBtn stopPropagations so highlights don't also fire this.
  const clickable = !!onShowDetails;
  const openDetails = () => { onShowDetails?.(event); };
  // Which (if any) highlight button this finished tile ends up showing. Each is
  // its own strict lookup, and a tile renders at most one of them — a miss adds
  // nothing, so the tile keeps its natural height rather than a blank band.
  const showRaceBtn = isPost && isRace && !!event.officialChannel && raceSource !== null;
  // FOM refuses embeds, so a FORMULA 1 clip can only ever be handed off to
  // YouTube — VideoModal skips straight to its "Watch on YouTube" card. Say so
  // on the button instead of letting the tap discover it.
  const raceOpensYouTube = showRaceBtn && leadChannelBlocksEmbeds([event.officialChannel!]);
  const showPokerBtn = isPost && event.kind === "poker" && !!event.officialChannel && pokerSource !== null;
  const showBoxingBtn = isPost && event.kind === "boxing" && !!event.officialChannel && boxingSource !== null;
  const showChessBtn = isPost && event.kind === "chess" && !!event.officialChannel && chessSource !== null;

  return (
    <div ref={rootRef} className={`ns-card-focus rounded-lg px-2 sm:px-4 py-2 sm:py-3 transition-colors relative${clickable ? " cursor-pointer" : ""}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--border-hover)")}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      onClick={clickable ? openDetails : undefined}
      // Guard on e.target === e.currentTarget, as the FightCard tile and GameCard
      // do: without it, Space/Enter on a nested play button (race/poker/boxing/
      // chess highlight) would ALSO pop the detail sheet on top of the video the
      // user just started — and preventDefault here would block the button's own
      // Space activation.
      onKeyDown={clickable ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDetails(); } } : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${event.title} — event details` : undefined}
      title={clickable ? event.title : undefined}>
      {/* Meta row — game-meta-row like FightCard/GameCard, so an F1 tile is the
          SAME height as an MLB card: status/time left, broadcast right (dropped
          when the column is too narrow, same metaCompact rule as UFC). An
          upcoming time renders at text-[11px] muted — the exact classes
          GameCard's future-time span uses — while Final/Live keep the row's
          text-xs like GameCard's FINAL/clock. */}
      {!hideHistoricalMeta && <div className={`game-meta-row flex items-center gap-2 mb-1 sm:mb-2 ${compact ? "min-h-[14px]" : "min-h-[18px]"} text-xs`}>
        <span className="shrink-0 whitespace-nowrap flex items-center gap-1.5" style={{ color: isLive ? "#16a34a" : "var(--text-muted)" }}>
          {/* The sport glyph rides the meta row, which had a 6px live dot and
              otherwise nothing on its left half, so the two text rows below
              inherit the FULL card width instead of a 30px logo slot they only
              use on one of them. That is 30px back on the exact line that kept
              clipping: "Triton Super High Roller · Jeju" needs 189px and the
              5-column board gave the title 173px, so it had to shrink to 12px
              beside 14px MLB team names; with the slot gone it has 203px and
              renders at full size (Jacob 9/4, "layout inside of it can be
              optimized"). Card height is untouched — no row is added or
              removed, so the tile still matches an MLB card at every
              breakpoint, which is the constraint that rules out wrapping the
              title onto a second line. */}
          {glyphInMeta && <span {...glyphA11y} className="text-xs leading-none">{glyph}</span>}
          {isLive && <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />}
          {isLive && <span className="sr-only">Live</span>}
          {isPost || isLive ? status : <span className="text-[11px] whitespace-nowrap">{status}</span>}
        </span>
        {!metaCompact && event.broadcasts.length > 0 && (
          <span className="shrink-0 ml-auto truncate" style={{ color: "var(--text-muted)" }}>{event.broadcasts[0]}</span>
        )}
      </div>}
      {/* Body — the game cards' EXACT two-row team skeleton (logo slot + name,
          gap-y-0.5, leading-none, truncate), with 🏁 in the away-logo slot and
          the circuit in the home row, so the tile's height and fonts track an
          MLB card 1:1 at every breakpoint. */}
      <div className="flex flex-col gap-y-0.5">
        {/* min-h-6 — same fix as FighterRow: a game card's team row is 24px at
            EVERY width (its team-name-container is a full line box), while
            these rows' 16px mobile logo slot + leading-none text would collapse
            shorter, drifting the column heights apart as cards stack. */}
        <div className={`flex items-center gap-1 sm:gap-1.5 min-w-0 ${compact ? "min-h-[28px]" : "min-h-6"}`}>
          {/* Fallback home for the glyph: a historical finished tile drops the
              meta row entirely (hideHistoricalMeta, same rule the game cards
              use), and the sport marker must not vanish with it. That branch
              renders exactly the layout this tile always had. */}
          {!glyphInMeta && <span {...glyphA11y} className="w-4 h-4 sm:w-6 sm:h-6 shrink-0 flex items-center justify-center text-sm sm:text-base leading-none">{glyph}</span>}
          {/* flex-1: the span must OWN the leftover width even when its text is
              short, because FittedLine reads that width off clientWidth. A
              plain auto-basis flex item shrinks to its text and would report
              "no room" for a name that fits comfortably. */}
          {compact ? (
            // ── Two-line title, at the SAME card height ──────────────────────
            //
            // A 122px card (three columns on a 414px phone) cannot fit a real
            // event name on one line at any size the ladder is allowed to use:
            // "Triton Super High Roller · Jeju" still clipped sitting at the
            // 11px floor. Wrapping is the only way to show the whole name, and
            // Jacob's condition on it was that the card stay the same height as
            // an MLB card beside it — "only if its same height of a card as 1
            // mlb card" (9/4). So the second line is not ADDED to the tile, it
            // is TRADED for: the meta row above gives up 4px (18 -> 14, which
            // it has spare — at this width it holds a 10px glyph and a 6px live
            // dot and nothing else), and this row takes exactly those 4px
            // (24 -> 28). Two 14px line boxes fill it. Card total is unchanged
            // at 90px, verified against the MLB card in card-height-parity.
            //
            // NOT FittedLine: that ladder measures with white-space:nowrap and
            // exists to avoid a second line. Here the text keeps the class's own
            // 12px — the same size the compact tile already used — and wraps
            // instead of shrinking. lineHeight is pinned in px rather than left
            // to leading-none so the two lines add up to the row exactly; a
            // unitless value would drift with the font size.
            //
            // line-clamp-2 is the last resort a name too long even for two
            // lines falls back to, the same role `truncate` plays on the wide
            // tile. tests/visual/text-fit.spec.ts asserts vertical overflow, not
            // just horizontal, so a clamp that actually bites still fails the
            // guard rather than hiding behind a wrapped line's clean scrollWidth.
            <span
              data-fit-line="title"
              title={event.title}
              className="text-xs min-w-0 flex-1"
              style={{
                color: "var(--text)",
                lineHeight: "14px",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {event.title}
            </span>
          ) : (
          <FittedLine
            variants={titleVariants}
            lineKind="title"
            fullText={event.title}
            floorPx={FIT_FLOOR_TITLE}
            className="text-sm team-name leading-none truncate min-w-0 flex-1"
            style={{ color: "var(--text)" }}
          />)}
        </div>
        {/* Second row ALWAYS renders, even with no subtitle. This is the tile's
            stand-in for a game card's second team row, so dropping it when the
            feed carries no venue made the tile 24px shorter than every card
            around it — IndyCar (no subtitle in ESPN's payload) sat visibly
            short next to NASCAR and MLB (Jacob 8/9). Empty and aria-hidden when
            there's nothing to say, so screen readers hear a one-line tile. */}
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 min-h-6" aria-hidden={event.subtitle ? undefined : true}>
          {!glyphInMeta && <span className="w-4 h-4 sm:w-6 sm:h-6 shrink-0" />}
          <FittedLine
            variants={subtitleVariants}
            lineKind="subtitle"
            fullText={event.subtitle || undefined}
            floorPx={FIT_FLOOR_SUBTITLE}
            className="ns-ink-safe text-[10px] sm:text-xs leading-none truncate min-w-0 flex-1"
            style={{ color: "var(--text-muted)" }}
          />
        </div>
      </div>
      {/* One official-channel button, like UFC's. A strict miss hides it; no
          racing path opens a generic YouTube results page. */}
      {/* Racing. Every family here follows the same rule the new soccer leagues
          were held to: a button goes in once its official channel has been
          verified end-to-end, not before. Boxing is handled below through a
          per-card promoter mapping because DAZN / Top Rank / Matchroom / PBC
          have no shared uploader; chess through an organizer mapping, and what
          it plays is the round broadcast rather than a highlight reel, because
          the sport publishes none. See NO_HIGHLIGHT_FALLBACK in lib/youtube.ts
          for the case where the answer is no button at all (cricket).
          .hl-slot wraps all four so a finished tile with no clip reserves the
          row whenever another card on the board has one — the same floor as
          GameCard (globals.css), so a race or poker tile never sits one row
          shorter than the MLB card beside it once the board has clips.
          `|| isPastDate` for the live-major case — see hideHistoricalMeta. */}
      <div className={isPost || isPastDate ? "hl-slot" : undefined}>
      {showRaceBtn && (
        <div className="mt-1 sm:mt-2 flex gap-1">
          {/* Label follows the series, not the tile: this same race layout also
              renders NASCAR and IndyCar, which would otherwise both offer an
              "F1" highlight button. Falls back to "F1" for older cards.
              The "(Opens YouTube)" tail is keyed off the CHANNEL's embed
              policy, not off F1 by name — FOM blocks embedding, so the modal
              can only hand the clip off, and NASCAR/IndyCar play in-app from
              the same layout and must not claim otherwise. If FOM ever
              re-enables embeds, removing the channel from EMBED_BLOCKED_CHANNELS
              takes the tail with it. */}
          <PlayBtn
            label={raceSource?.label ?? event.officialLabel ?? "F1"}
            loading={loadingId === "race-official"}
            onClick={playRaceHighlight}
            note={raceOpensYouTube ? (metaCompact ? "↗" : "(Opens YouTube)") : undefined}
            hint={raceOpensYouTube ? "opens YouTube" : undefined}
          />
        </div>
      )}
      {/* Poker replays are stricter than racing: exact tour channel or no
          button. A failed lookup never opens YouTube search because result
          titles commonly contain the champion. */}
      {showPokerBtn && (
        <div className="mt-1 sm:mt-2 flex gap-1">
          <PlayBtn
            label={pokerSource?.label ?? event.officialLabel ?? "Poker"}
            loading={loadingId === "poker-official"}
            onClick={playPoker}
          />
        </div>
      )}
      {/* Boxing has no league-wide uploader. Curated major records supply the
          exact promoter/rightsholder channel; a miss hides this button and
          never opens a spoiler-heavy search page. */}
      {showBoxingBtn && (
        <div className="mt-1 sm:mt-2 flex gap-1">
          <PlayBtn
            label={boxingSource?.label ?? event.officialLabel ?? "Boxing"}
            loading={loadingId === "boxing-official"}
            onClick={playBoxing}
          />
        </div>
      )}
      {/* Chess plays the organizer's ROUND BROADCAST — there is no highlight
          package in the sport (see CHESS_ORGANIZER_CHANNELS in lib/espn.ts).
          Strict channel + tournament-token gated like the rest, so an event
          with no mapped organizer, or a round that is not up, shows nothing
          rather than a search page. */}
      {showChessBtn && (
        <div className="mt-1 sm:mt-2 flex gap-1">
          <PlayBtn
            label={chessSource?.label ?? event.officialLabel ?? "Round"}
            loading={loadingId === "chess-official"}
            onClick={playChessRound}
          />
        </div>
      )}
      </div>
    </div>
  );
}
