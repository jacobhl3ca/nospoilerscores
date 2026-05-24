"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import type { Sport } from "@/lib/types";
import { getApiBase } from "@/lib/youtube";

// Manifest is written by scripts/scrape-playoff-brackets.mjs alongside the
// PNGs. Sports missing from `sports` simply don't have a bracket image,
// so the trigger renders as plain text — out-of-season leagues never
// surface a broken modal.
interface BracketManifest {
  generatedAt: string;
  sports: Partial<Record<Sport, { year: number; generatedAt: string }>>;
}

let cachedManifest: BracketManifest | null = null;
let manifestPromise: Promise<BracketManifest | null> | null = null;
function loadBracketManifest(): Promise<BracketManifest | null> {
  if (cachedManifest) return Promise.resolve(cachedManifest);
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(`${getApiBase()}/brackets/manifest.json`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data && typeof data === "object" && "sports" in data) {
        cachedManifest = data as BracketManifest;
        return cachedManifest;
      }
      return null;
    })
    .catch(() => null);
  return manifestPromise;
}

function bracketImageUrl(sport: Sport, year: number): string {
  return `${getApiBase()}/brackets/${sport}-${year}.png`;
}

// Click-to-fullscreen overlay. Matches the highlights VideoModal styling so
// the bracket feels like part of the same modal vocabulary on the site:
// rgba(0,0,0,0.92) backdrop, Esc closes, click-outside closes.
function BracketFullModal({ sport, year, onClose }: { sport: Sport; year: number; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 sm:p-8"
      style={{ zIndex: 9999 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${sport.toUpperCase()} ${year} playoff bracket`}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.92)" }} />
      <div className="relative w-full max-w-6xl" style={{ zIndex: 1 }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 w-8 h-8 flex items-center justify-center rounded-full text-white/60 hover:text-white transition-colors cursor-pointer"
          title="Close (Esc)"
          aria-label="Close bracket"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={bracketImageUrl(sport, year)}
          alt={`${sport.toUpperCase()} ${year} playoff bracket`}
          className="block w-full h-auto rounded-lg"
          style={{ maxHeight: "85vh", objectFit: "contain" }}
          draggable={false}
        />
      </div>
    </div>
  );
}

// Trigger wraps the italics text and adds hover-preview (desktop) + click-
// to-fullscreen (all devices) behaviour, but ONLY when the sport has a
// bracket image available. When no bracket exists, children render as-is
// — the trigger is invisible / non-interactive — so out-of-season leagues
// (MLB in May, NFL in August) don't surface a broken interaction.
export function BracketTrigger({
  sport,
  enabled,
  children,
}: {
  sport: Sport;
  enabled: boolean;
  children: ReactNode;
}) {
  const [manifest, setManifest] = useState<BracketManifest | null>(cachedManifest);
  const [hover, setHover] = useState(false);
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!enabled || manifest) return;
    let cancelled = false;
    loadBracketManifest().then((m) => {
      if (!cancelled) setManifest(m);
    });
    return () => { cancelled = true; };
  }, [enabled, manifest]);

  const sportEntry = enabled ? manifest?.sports?.[sport] : null;
  const hasBracket = !!sportEntry;
  const year = sportEntry?.year ?? new Date().getFullYear();

  // No bracket available → render plain (non-interactive) children. This is
  // the most common case for out-of-season leagues, so we early-return.
  if (!hasBracket) return <>{children}</>;

  const onMouseMove = (e: React.MouseEvent<HTMLSpanElement>) => {
    // Position the preview just below the cursor; clamped to viewport so the
    // tooltip never spills off-screen on long bracket aspect ratios.
    const PREVIEW_W = 480;
    const PREVIEW_H = 320;
    const x = Math.min(window.innerWidth - PREVIEW_W - 12, Math.max(12, e.clientX - PREVIEW_W / 2));
    const y = Math.min(window.innerHeight - PREVIEW_H - 12, e.clientY + 20);
    setPreviewPos({ x, y });
  };

  return (
    <>
      <span
        ref={wrapperRef}
        // Desktop: hover-only. Touch devices ignore mouseenter/mouseleave
        // (they fire on tap), so the hover preview never appears on mobile;
        // the click handler still opens the modal there.
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setPreviewPos(null); }}
        onMouseMove={onMouseMove}
        onClick={() => setModalOpen(true)}
        className="cursor-pointer hover:underline transition-colors"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setModalOpen(true);
          }
        }}
        aria-haspopup="dialog"
        aria-label={`Show ${sport.toUpperCase()} playoff bracket`}
      >
        {children}
      </span>

      {hover && previewPos && (
        <div
          className="pointer-events-none fixed hidden md:block rounded-lg shadow-2xl overflow-hidden"
          style={{
            left: previewPos.x,
            top: previewPos.y,
            width: 480,
            zIndex: 9998,
            border: "1px solid var(--border)",
            background: "var(--bg-card)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bracketImageUrl(sport, year)}
            alt=""
            className="block w-full h-auto"
            draggable={false}
          />
        </div>
      )}

      {modalOpen && (
        <BracketFullModal sport={sport} year={year} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
