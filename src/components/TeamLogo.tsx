"use client";

import type { ImgHTMLAttributes } from "react";
import { darkTeamLogo, sizedTeamLogo } from "@/lib/teamLogos";
import { useDarkTheme, useFailedUrls } from "@/lib/useLogoTheme";

// A team logo <img>. In dark theme an ESPN logo loads ESPN's dark-theme copy
// (darkTeamLogo), the same rule LeagueMark follows for league marks: black and
// navy one-colour marks (Iowa, Wake Forest, Juventus, Yankees, Spurs) all but
// vanished on the dark card (audit 2026-10-14). A failed dark copy falls back
// to the light one; when that fails too the image hides, by `visibility` (the
// box keeps its width, so names stay aligned) or by `display` (it collapses).
// Other URLs (self-hosted art, NCAA.com, FotMob, MLB's SVGs) load as given.
export function TeamLogo({
  src,
  hide = "visibility",
  onFail,
  style,
  alt = "",
  ...img
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src: string;
  hide?: "visibility" | "display";
  // Called once the light copy fails too (the Settings picker swaps in an initials tile).
  onFail?: () => void;
}) {
  const darkTheme = useDarkTheme();
  const { failed, markFailed } = useFailedUrls();
  // ESPN logos load at the drawn size (sizedTeamLogo); no width = as given.
  const px = Number(img.width) || 0;
  const lightUrl = sizedTeamLogo(src, px);
  const dark = darkTheme ? darkTeamLogo(src) : undefined;
  const darkUrl = dark ? sizedTeamLogo(dark, px) : undefined;
  const url = darkUrl && !failed.includes(darkUrl) ? darkUrl : lightUrl;
  const gone = failed.includes(lightUrl);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...img}
      src={url}
      alt={alt}
      data-team-logo={darkUrl && url === darkUrl ? "dark" : "light"}
      style={gone ? { ...style, ...(hide === "display" ? { display: "none" } : { visibility: "hidden" }) } : style}
      onError={() => {
        markFailed(url);
        if (url === lightUrl) onFail?.();
      }}
    />
  );
}
