"use client";

import { useState } from "react";
import type { Sport } from "@/lib/types";
import { leagueLogoSmall } from "@/lib/news";

// A league's logo on a white circle: the first-run league picker, the Settings
// league chips and the column pills. Most marks are dark on transparent, so on
// the accent fill or in dark mode they would disappear without the chip.
export function LeagueMark({
  sport,
  size = 14,
  src,
  className = "",
}: {
  sport: Sport;
  // Image px; the circle is 4px wider.
  size?: number;
  // ?demo=1 placeholder logo (see demoMode.ts).
  src?: string;
  className?: string;
}) {
  const url = src ?? leagueLogoSmall(sport);
  // A blocked hotlink takes the circle with it, so the chip reads as plain
  // text and not a white dot. Keyed to the URL so a new league tries again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (failedUrl === url) return null;
  return (
    <span
      aria-hidden="true"
      data-league-mark={sport}
      className={`inline-flex items-center justify-center rounded-full shrink-0 bg-white ${className}`}
      style={{ width: size + 4, height: size + 4 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className="object-contain"
        style={{ width: size, height: size }}
        draggable={false}
        onError={() => setFailedUrl(url)}
      />
    </span>
  );
}
