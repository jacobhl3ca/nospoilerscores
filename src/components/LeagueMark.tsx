"use client";

import { useState, useSyncExternalStore } from "react";
import type { Sport } from "@/lib/types";
import { INVERT_IN_DARK, LEAGUE_EMOJI, leagueLogoDark, leagueLogoSmall } from "@/lib/news";

// <html data-theme> is the resolved theme: the pre-paint script, the Theme
// pills and the OS listener all write it, so it follows a manual Light/Dark
// pick and not only the OS setting.
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readTheme = () => document.documentElement.getAttribute("data-theme") === "dark";

// A league's logo: the first-run league picker, the Settings league chips and
// the column pills.
// - plate: the picker's white circle, with LEAGUE_LOGO as it always was. Most
//   marks are dark on transparent, so on its accent fill they would disappear.
// - no plate (Settings, Jacob 9/30): the logo sits on the chip itself. ESPN's
//   dark-theme copy in dark mode (tone="auto") or on a dark fill (tone="dark",
//   the ticked chip), and a sport emoji for a league with no mark of its own.
export function LeagueMark({
  sport,
  size,
  src,
  plate = false,
  tone = "auto",
  className = "",
}: {
  sport: Sport;
  // Image px. With a plate the circle is 4px wider; default 14 with, 18 without.
  size?: number;
  // ?demo=1 placeholder logo (see demoMode.ts).
  src?: string;
  plate?: boolean;
  tone?: "auto" | "dark";
  className?: string;
}) {
  const px = size ?? (plate ? 14 : 18);
  const darkTheme = useSyncExternalStore(subscribeTheme, readTheme, () => false);
  const onDark = !plate && (tone === "dark" || darkTheme);
  const normalUrl = src ?? leagueLogoSmall(sport);
  const darkUrl = onDark && !src ? leagueLogoDark(sport) : undefined;
  // A failed dark copy falls back to the normal one; when that fails too the
  // mark goes, so the chip reads as plain text and not a broken image or a
  // white dot. Keyed to the URL so a new league tries again.
  const [failed, setFailed] = useState<string[]>([]);
  const url = darkUrl && !failed.includes(darkUrl) ? darkUrl : normalUrl;
  const emoji = !plate && !src ? LEAGUE_EMOJI[sport] : undefined;

  if (emoji) {
    return (
      <span
        aria-hidden="true"
        data-league-mark={sport}
        data-league-emoji=""
        className={`inline-flex items-center justify-center shrink-0 leading-none ${className}`}
        style={{ width: px, height: px, fontSize: Math.round(px * 0.85), filter: onDark && INVERT_IN_DARK.has(sport) ? "invert(1)" : undefined }}
      >
        {emoji}
      </span>
    );
  }
  if (failed.includes(url)) return null;
  const invert = onDark && url === normalUrl && INVERT_IN_DARK.has(sport);
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      width={px}
      height={px}
      loading="lazy"
      decoding="async"
      className="object-contain"
      style={{ width: px, height: px, filter: invert ? "brightness(0) invert(1)" : undefined }}
      draggable={false}
      onError={() => setFailed((f) => (f.includes(url) ? f : [...f, url]))}
    />
  );
  if (!plate) {
    return (
      <span
        aria-hidden="true"
        data-league-mark={sport}
        className={`inline-flex items-center justify-center shrink-0 ${className}`}
        style={{ width: px, height: px }}
      >
        {img}
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-league-mark={sport}
      data-league-plate=""
      className={`inline-flex items-center justify-center rounded-full shrink-0 bg-white ${className}`}
      style={{ width: px + 4, height: px + 4 }}
    >
      {img}
    </span>
  );
}
