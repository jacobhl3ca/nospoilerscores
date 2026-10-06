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
// the column pills. It sits on the chip itself, no white plate (Jacob 9/30,
// 10/1; the plate prop left 10/4). ESPN's dark-theme copy in dark mode
// (tone="auto") or on a dark fill (tone="dark", the ticked chip), and a sport
// emoji for a league with no mark of its own.
export function LeagueMark({
  sport,
  size,
  src,
  tone = "auto",
  className = "",
}: {
  sport: Sport;
  // Image px, default 18.
  size?: number;
  // ?demo=1 placeholder logo (see demoMode.ts).
  src?: string;
  tone?: "auto" | "dark";
  className?: string;
}) {
  const px = size ?? 18;
  const darkTheme = useSyncExternalStore(subscribeTheme, readTheme, () => false);
  const onDark = tone === "dark" || darkTheme;
  const normalUrl = src ?? leagueLogoSmall(sport);
  const darkUrl = onDark && !src ? leagueLogoDark(sport) : undefined;
  // A failed dark copy falls back to the normal one; when that fails too the
  // mark goes, so the chip reads as plain text and not a broken image or a
  // white dot. Keyed to the URL so a new league tries again.
  const [failed, setFailed] = useState<string[]>([]);
  const url = darkUrl && !failed.includes(darkUrl) ? darkUrl : normalUrl;
  const emoji = !src ? LEAGUE_EMOJI[sport] : undefined;

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
  return (
    <span
      aria-hidden="true"
      data-league-mark={sport}
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: px, height: px }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
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
    </span>
  );
}
