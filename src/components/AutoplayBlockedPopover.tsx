"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// The browser refused muted autoplay (Jacob 10/9: "instead of that thing on
// top a one time popup message similar to our add a league popup"). Same card
// as AddLeaguePopover, centered over the clip that was refused, shown once
// ever. It says how to allow autoplay in the browser in use; each clip also
// says "Tap to play" on itself (InlineVideoCard).

type Browser = "firefox" | "safari" | "ios" | "other";

function detectBrowser(): Browser {
  const ua = navigator.userAgent;
  // iPadOS reports a Mac UA; touch points give it away. Every iPhone/iPad
  // browser is WebKit, so FxiOS and CriOS count as iOS too.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|OPR\//.test(ua)) return "safari";
  return "other";
}

function howTo(browser: Browser): string {
  switch (browser) {
    case "firefox":
      return "To let clips play by themselves, click the icon at the left of the address bar and set Autoplay to Allow Audio and Video.";
    case "safari":
      return `To let clips play by themselves, open Safari > Settings for ${window.location.hostname} and set Auto-Play to Allow All Auto-Play.`;
    case "ios":
      return "Low Power Mode stops autoplay on iPhone and iPad. Clips play by themselves again when it is off.";
    default:
      return "To let clips play by themselves, allow autoplay or sound for this site in your browser's site settings.";
  }
}

export default function AutoplayBlockedPopover({ anchor, onTurnOff, onClose }: {
  // The refused clip's media box.
  anchor: HTMLElement;
  onTurnOff: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [browser] = useState(detectBrowser);

  // Centered over the clip, kept inside the viewport, and it follows the clip
  // while the page scrolls. A clip that leaves the page (layout switch) closes it.
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      if (!anchor.isConnected) { onClose(); return; }
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.max(8, Math.min(a.left + (a.width - w) / 2, window.innerWidth - w - 8));
      const top = Math.max(8, Math.min(a.top + (a.height - h) / 2, window.innerHeight - h - 8));
      setPos({ left, top });
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [anchor, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    const away = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", away);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      data-testid="autoplay-blocked-popup"
      className="fixed z-[70] rounded-xl p-3 shadow-xl"
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
        width: "min(300px, calc(100vw - 16px))",
        background: "var(--bg)",
        border: "1px solid var(--border)",
      }}
    >
      <p id={titleId} className="text-sm font-semibold mb-1.5" style={{ color: "var(--text)" }}>Your browser blocks autoplay</p>
      <p className="text-sm mb-1.5" style={{ color: "var(--text)" }}>Tap a clip to play it with sound.</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{howTo(browser)}</p>
      <div className="flex justify-end gap-2 mt-2.5">
        <button type="button"
          onClick={onTurnOff}
          className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          Turn Autoplay off
        </button>
        <button type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
