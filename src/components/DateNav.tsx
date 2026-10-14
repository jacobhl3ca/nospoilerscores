"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { getEtServiceDate, getTimeZone } from "@/lib/etDay";

interface DateNavProps {
  selectedDate: string; // YYYYMMDD
  onDateChange: (date: string) => void;
  // Optional node rendered to the RIGHT of the › arrow (e.g. a bare calendar
  // icon) without shifting the Yesterday/Today/Tomorrow buttons.
  trailing?: ReactNode;
  // Route offset (-1/0/1 for /yesterday|/today|/tomorrow; undefined for "/").
  // Used as the pre-hydration fallback so the right pill is highlighted while
  // selectedDate is still "" — otherwise Today flashes before the real date.
  initialOffset?: number;
  // Route's absolute YYYYMMDD, when it has one (the World Cup hub after the
  // final). Same pre-hydration role as initialOffset, and wins over it.
  initialDate?: string;
  // "strip" = the phone's scrollable day-chip row (9/29, FotMob style), -7…+7
  // days around today. Default = the ‹ Yesterday/Today/Tomorrow › pills.
  variant?: "pills" | "strip";
}

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function parseYMD(yyyymmdd: string): Date {
  const y = +yyyymmdd.slice(0, 4);
  const m = +yyyymmdd.slice(4, 6) - 1;
  const d = +yyyymmdd.slice(6, 8);
  return new Date(y, m, d);
}

function formatDayName(yyyymmdd: string): string {
  return parseYMD(yyyymmdd).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDayShort(yyyymmdd: string): string {
  const d = parseYMD(yyyymmdd);
  const dow = d.toLocaleDateString("en-US", { weekday: "short" });
  return `${dow} ${d.getMonth() + 1}/${d.getDate()}`;
}

// Current date in ET, shifted so the "day" doesn't roll over until 1 AM ET (so
// late-night games stay on "today"). Delegates to the shared service-day helper
// so the data layer's past/future boundary uses the EXACT same notion of today
// — see src/lib/etDay.ts for why that matters.
function getNowET(): Date {
  return getEtServiceDate();
}

export function getDateString(daysOffset: number): string {
  const d = getNowET();
  d.setDate(d.getDate() + daysOffset);
  return toYYYYMMDD(d);
}

// Export for use in smart default offset calculation
export function getETHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: getTimeZone(),
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  // % 24 guards the "24" some ICU builds emit for midnight (same guard as
  // getEtServiceDate/etSlateYmd in lib/etDay.ts). Without it the consumers that
  // compare the hour against a low cutoff — getSmartDefaultOffset's `< 1`
  // midnight check and the ratings-auto `< 12` morning check in HomeContent —
  // would see 24 instead of 0 and skip the branch for the whole 12–1 AM window.
  return parseInt(get("hour"), 10) % 24;
}

// Custom calendar dropdown — starts Monday, blue weekends
function CalendarDropdown({ selectedDate, onDateChange, onClose }: DateNavProps & { onClose: () => void }) {
  const [viewDate, setViewDate] = useState(() => parseYMD(selectedDate));

  // Keep the displayed month in sync with the controlled date. `viewDate` (which
  // drives the rendered grid) is seeded from selectedDate once on open, but the
  // ‹/› day arrows and Yesterday/Today/Tomorrow pills in the DateNav row beside
  // the calendar toggle stay live WHILE the dropdown is open (the toggle is that
  // row's `trailing` node). Paging the date across a month boundary — e.g. ‹ from
  // Jul 1 to Jun 30 — then changed selectedDate but left the grid stranded on the
  // old month, with the selected-day highlight (dateStr === selectedDate) matching
  // nothing shown. Re-sync so the grid follows. Manual month paging (prev/next)
  // moves only viewDate, not selectedDate, so it never fights this.
  useEffect(() => {
    setViewDate(parseYMD(selectedDate));
  }, [selectedDate]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // NOTE: two DateNav/CalendarDropdown instances (mobile + desktop) are
      // both mounted whenever calendarOpen is true — CSS `hidden` doesn't
      // unmount them. A single-instance `ref.contains` check made the HIDDEN
      // dropdown's listener fire on clicks inside the VISIBLE one, closing +
      // unmounting both before the date button's click could land (so picking
      // a date did nothing). Match any calendar popover or toggle by attribute
      // so a click inside either instance counts as "inside".
      const t = e.target as Element | null;
      if (t && t.closest("[data-cal-pop],[data-cal-toggle]")) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  // Monday = 0, Sunday = 6
  const startDay = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const todayStr = getDateString(0);
  const dayHeaders = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = firstOfMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div
      data-cal-pop
      // The calendar toggle button declares aria-haspopup + aria-expanded, so
      // give the popover it opens a matching role + accessible name — otherwise
      // it surfaces to assistive tech as an anonymous, role-less region. Matches
      // the role="dialog" + aria-label pattern every other overlay in the app
      // uses (GameDetailModal, WorldCupGroupsModal, the HomeContent explainers).
      // The month caption (aria-live) and day cells (aria-current) already carry
      // their own state; this just names the container they live in.
      role="dialog"
      aria-label="Choose a date"
      className="absolute top-full mt-2 right-0 z-50 rounded-xl shadow-lg p-3 w-64"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} aria-label="Previous month" className="w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-[var(--bg-card)]" style={{ color: "var(--text-muted)" }}>
          ‹
        </button>
        {/* Live region: the ‹/› buttons swap the grid in place, so without
            this a screen reader announces nothing when the month changes.
            aria-live="polite" + atomic re-reads the full "July 2026" caption
            on each navigation so SR users know which month they're viewing. */}
        <span className="text-sm font-semibold" style={{ color: "var(--text)" }} aria-live="polite" aria-atomic="true">{monthLabel}</span>
        <button type="button" onClick={nextMonth} aria-label="Next month" className="w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-[var(--bg-card)]" style={{ color: "var(--text-muted)" }}>
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {dayHeaders.map((dh, i) => (
          // Decorative visual column guides. A screen reader can't perceive the
          // grid alignment they orient sighted users to, and each day button
          // already announces its full weekday in its aria-label — so left
          // exposed these render as seven meaningless "Mo"/"Tu"… fragments read
          // out before the grid. Hide them so the dates speak for themselves.
          <div
            key={dh}
            aria-hidden="true"
            className="text-[10px] font-medium py-1"
            style={{ color: i >= 5 ? "var(--accent)" : "var(--text-muted)" }}
          >
            {dh}
          </div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const cellDate = new Date(year, month, day);
          const dateStr = toYYYYMMDD(cellDate);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          const dow = (i % 7); // 0=Mon ... 6=Sun
          const isWeekend = dow >= 5;
          // The visible label is just the day number — give assistive tech the
          // full date plus the today/selected state that's otherwise conveyed
          // only by the underline/background styling it can't see.
          const fullDate = cellDate.toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric", year: "numeric",
          });
          const ariaLabel = isToday ? `${fullDate} (today)` : fullDate;

          return (
            <button
              type="button"
              key={dateStr}
              onClick={() => { onDateChange(dateStr); onClose(); }}
              aria-label={ariaLabel}
              aria-current={isSelected ? "date" : undefined}
              className="w-8 h-8 flex items-center justify-center rounded-full text-xs cursor-pointer transition-colors"
              style={
                isSelected
                  ? { background: "var(--accent)", color: "white", fontWeight: 700 }
                  : {
                      color: isWeekend ? "var(--accent)" : "var(--text)",
                      fontWeight: isToday ? 700 : 400,
                      ...(isToday && !isSelected ? { textDecoration: "underline", textUnderlineOffset: "2px" } : {}),
                    }
              }
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-card-hover)"; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Exported for use in toolbar
export { CalendarDropdown };

// How far the phone strip reaches either side of today.
const STRIP_DAYS = 7;

function DateStrip({ selectedDate, onDateChange, trailing, initialOffset, initialDate }: DateNavProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  // Dates only after mount. The board HTML is cached for hours, so a server-
  // rendered "Tue 9/22" goes stale and breaks hydration; the three word chips
  // below read the same on any day, so they are the first paint instead.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const today = getDateString(0);
  const effectiveDate = selectedDate || initialDate || getDateString(initialOffset ?? 0);
  // Same rule as the pills: on bare "/" nothing is known to be selected until
  // the smart default resolves, so nothing is underlined before then.
  const knowsSelection = initialOffset !== undefined || initialDate !== undefined || selectedDate !== "";

  const days: string[] = [];
  for (let i = -STRIP_DAYS; i <= STRIP_DAYS; i++) days.push(getDateString(i));
  // A calendar pick outside the window still gets a chip, at the near end.
  if (effectiveDate < days[0]) days.unshift(effectiveDate);
  else if (effectiveDate > days[days.length - 1]) days.push(effectiveDate);

  const labelFor = (d: string) =>
    d === today ? "Today"
      : d === getDateString(-1) ? "Yesterday"
        : d === getDateString(1) ? "Tomorrow"
          : formatDayShort(d);

  // Centre a chip by moving only the strip's own scroll position, so the page
  // itself never scrolls. Today on first paint (once, no animation); after
  // that, a date change brings its chip into view.
  const centre = (date: string, smooth: boolean) => {
    const scroller = scrollerRef.current;
    const chip = scroller?.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (!scroller || !chip) return;
    // Rects, not offsetLeft: the strip is not positioned, so offsetLeft would
    // measure from the fixed header and land 16 px off.
    const chipLeft = chip.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
    const left = chipLeft - (scroller.clientWidth - chip.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: smooth ? "smooth" : "auto" });
  };
  // Until the user touches the strip, keep Today centred while the row is
  // still settling (web fonts, the header's late CSS, a rotation).
  const userMoved = useRef(false);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!mounted || !scroller) return;
    centre(today, false);
    const again = () => { if (!userMoved.current) centre(today, false); };
    const ro = new ResizeObserver(again);
    ro.observe(scroller);
    document.fonts?.ready.then(again).catch(() => {});
    const moved = () => { userMoved.current = true; };
    scroller.addEventListener("pointerdown", moved, { passive: true });
    scroller.addEventListener("touchstart", moved, { passive: true });
    scroller.addEventListener("wheel", moved, { passive: true });
    return () => {
      ro.disconnect();
      scroller.removeEventListener("pointerdown", moved);
      scroller.removeEventListener("touchstart", moved);
      scroller.removeEventListener("wheel", moved);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the dates appear
  }, [mounted]);
  const settled = useRef(false);
  useEffect(() => {
    if (!mounted || !selectedDate) return;
    if (!settled.current) {
      settled.current = true;
      // The first resolved date (the smart default landing on yesterday, a
      // /tomorrow route) is not a user move: Today stays centred when that
      // chip is already beside it.
      if (Math.abs(days.indexOf(selectedDate) - days.indexOf(today)) <= 1) return;
      userMoved.current = true;
      centre(selectedDate, false);
      return;
    }
    userMoved.current = true;
    centre(selectedDate, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- days/today derive from the date
  }, [mounted, selectedDate]);

  const chip = (key: string, label: string, ariaLabel: string, isSelected: boolean, date?: string) => (
    <button
      type="button"
      key={key}
      data-date={date}
      onClick={date ? () => onDateChange(date) : undefined}
      aria-current={isSelected ? "date" : undefined}
      aria-label={ariaLabel}
      className="date-strip-chip shrink-0 px-3 pt-1.5 pb-2 text-[13px] whitespace-nowrap cursor-pointer transition-colors"
      style={{
        color: isSelected ? "var(--accent)" : "var(--text-muted)",
        fontWeight: isSelected ? 600 : 400,
        boxShadow: isSelected ? "inset 0 -2px 0 var(--accent)" : "none",
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      <div
        ref={scrollerRef}
        data-testid="date-strip"
        className={`date-strip flex-1 min-w-0 flex overflow-x-auto${mounted ? "" : " justify-center"}`}
        role="group"
        aria-label="Choose a day"
      >
        {mounted
          ? days.map((d) => {
              const label = labelFor(d);
              return chip(d, label, label === formatDayShort(d) ? formatDayName(d) : label, knowsSelection && d === effectiveDate, d);
            })
          : ([[-1, "Yesterday"], [0, "Today"], [1, "Tomorrow"]] as const).map(([offset, label]) =>
              chip(String(offset), label, label, initialDate === undefined && initialOffset === offset))}
      </div>
      {trailing && <div className="flex items-center shrink-0 pb-0.5">{trailing}</div>}
    </div>
  );
}

export default function DateNav(props: DateNavProps) {
  if (props.variant === "strip") return <DateStrip {...props} />;
  return <DatePills {...props} />;
}

function DatePills({ selectedDate, onDateChange, trailing, initialOffset, initialDate }: DateNavProps) {
  const yesterday = getDateString(-1);
  const today = getDateString(0);
  const tomorrow = getDateString(1);

  // Pre-hydration the page renders with selectedDate="" (HomeContent fills it
  // in an effect). "" sorts before yesterday, so the left pill rendered
  // formatDayName("") — parseYMD("") is new Date(0, -1, 0) = "Thu, Nov 30" —
  // flashing on every refresh (Jacob 6/12). Fall back to the ROUTE's date
  // (initialOffset, a server-known prop) rather than today, so the right pill
  // is highlighted on the very first paint — otherwise Today flashed before
  // settling on the selected date (e.g. /yesterday) once selectedDate loads
  // (Jacob 6/13). Root "/" has no offset → defaults to today as before.
  const effectiveDate = selectedDate || initialDate || getDateString(initialOffset ?? 0);

  const isStandardDate = effectiveDate === yesterday || effectiveDate === today || effectiveDate === tomorrow;
  const isBefore = !isStandardDate && effectiveDate < yesterday;
  const isAfter = !isStandardDate && effectiveDate > tomorrow;

  // `wide` flags the out-of-window date slot: its short label is a full date
  // ("Tue 5/2"), not a 4-char word, so it needs to grow past the fixed mobile
  // pill width instead of being clipped by overflow-hidden.
  const dateButtons: { date: string; label: string; shortLabel: string; wide?: boolean }[] = [
    isBefore
      ? { date: effectiveDate, label: formatDayName(effectiveDate), shortLabel: formatDayShort(effectiveDate), wide: true }
      : { date: yesterday, label: "Yesterday", shortLabel: "Yest" },
    { date: today, label: "Today", shortLabel: "Today" },
    isAfter
      ? { date: effectiveDate, label: formatDayName(effectiveDate), shortLabel: formatDayShort(effectiveDate), wide: true }
      : { date: tomorrow, label: "Tomorrow", shortLabel: "Tomo" },
  ];

  const goEarlier = () => {
    const d = parseYMD(effectiveDate);
    d.setDate(d.getDate() - 1);
    onDateChange(toYYYYMMDD(d));
  };

  const goLater = () => {
    const d = parseYMD(effectiveDate);
    d.setDate(d.getDate() + 1);
    onDateChange(toYYYYMMDD(d));
  };

  return (
    // sm+: a `1fr | auto | 1fr` grid. The ‹ Yesterday/Today/Tomorrow › group is
    // the middle track, so it sits at the row's true centre — directly under
    // the Ratings tab — no matter what `trailing` holds: the two 1fr tracks
    // always split the leftover width equally. It replaces a fixed 32px leading
    // spacer that mirrored the calendar icon alone; once the single-column
    // toggle joined that icon (6/16) the trailing side was 70px and the whole
    // group sat 17px left of centre (Jacob 9/4: "today should be directly
    // under ratings"). Phones keep the plain flex row with no leading balance
    // (Jacob 5/31 — the cramped mobile header couldn't spare the width), and
    // their view tabs live in the bottom bar, so there is nothing above to
    // line up with.
    <div className="flex sm:grid sm:grid-cols-[1fr_auto_1fr] sm:w-full gap-0 sm:gap-0.5 items-center justify-center">
      <span aria-hidden className="hidden sm:block" />
      <div className="flex gap-0 sm:gap-0.5 items-center">
      <button
        type="button"
        onClick={goEarlier}
        className="date-nav-arrow w-7 h-7 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center rounded-full text-base transition-colors cursor-pointer"
        style={{ color: "var(--text-muted)" }}
        aria-label="Go back one day"
        title="Go back one day"
      >
        ‹
      </button>
      {dateButtons.map((btn) => {
        // On the bare "/" route (no initialOffset) the selected date isn't
        // known until the effect resolves the smart default — which is
        // *yesterday* before 1pm local time. The server can't compute that
        // (ET + prefs + local hour are client-only), so highlight NOTHING while
        // loading rather than flashing Today and then jumping to yesterday
        // (Jacob 6/13). Explicit /yesterday|/today|/tomorrow routes know their
        // pill from initialOffset and stay highlighted through load.
        const knowsSelection = initialOffset !== undefined || initialDate !== undefined || selectedDate !== "";
        const isSelected = knowsSelection && effectiveDate === btn.date;
        return (
          <button
            type="button"
            key={btn.date}
            onClick={() => onDateChange(btn.date)}
            // The selected pill is styled only via background + weight; mark it
            // aria-current="date" so screen readers announce which day is active
            // (the visual highlight alone isn't exposed to assistive tech).
            aria-current={isSelected ? "date" : undefined}
            // On phones the visible text is the abbreviated shortLabel ("Yest",
            // "Tomo"); the full `label` span is display:none and so dropped from
            // the accessibility tree. Pin the full word as the accessible name so
            // screen-reader users hear "Yesterday"/"Tomorrow" on every viewport.
            aria-label={btn.label}
            className={`date-nav-btn shrink-0 ${btn.wide ? "min-w-[2.65rem] w-auto px-1.5 sm:px-0" : "w-[2.65rem]"} sm:w-[5.5rem] py-2 sm:py-1.5 rounded text-[12px] sm:text-sm whitespace-nowrap transition-colors text-center overflow-hidden`}
            style={
              isSelected
                ? { background: "var(--bg-card-hover)", color: "var(--text)", fontWeight: 600 }
                : { color: "var(--text-muted)", background: "transparent" }
            }
          >
            <span className="hidden sm:inline">{btn.label}</span>
            <span className="sm:hidden">{btn.shortLabel || btn.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={goLater}
        className="date-nav-arrow w-7 h-7 sm:w-8 sm:h-8 shrink-0 flex items-center justify-center rounded-full text-base transition-colors cursor-pointer"
        style={{ color: "var(--text-muted)" }}
        aria-label="Go forward one day"
        title="Go forward one day"
      >
        ›
      </button>
      </div>
      {trailing && <div className="flex items-center sm:justify-self-start">{trailing}</div>}
    </div>
  );
}
