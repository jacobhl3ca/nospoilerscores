"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { formatRecapDuration } from "@/lib/recaps";
import { sortTeamsForFavorites, type MlbReview, type MlbReviewRec, type MlbReviewSection } from "@/lib/mlbReview";

// "2026 season in review": MLB's own round-ups of the finished season, opened
// from the "2026 in review" pill on today's MLB column (LeagueRecapCard
// onShowReview). Same shell as PlayoffPictureModal — fixed backdrop, Escape and
// backdrop close, focus trap. Every button plays the MLB.com HLS stream in
// VideoModal through `onPlay`; HomeContent hides this dialog while the video is
// up and brings it back, at the same section, when the video closes.
//
// ⛔ Our own words on every button. The only MLB text shown is a year-end
// show's title (result-free by the bake's classifier) and the team or player a
// "Stats & Oddities" cut is about.

function PlayButton({ rec, label, onPlay }: { rec: MlbReviewRec; label: string; onPlay: (rec: MlbReviewRec) => void }) {
  const mins = formatRecapDuration(rec.durationSec);
  return (
    <button
      type="button"
      data-review-play={rec.slug}
      onClick={() => onPlay(rec)}
      className="highlight-btn inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer transition-opacity hover:opacity-80 whitespace-nowrap"
      style={{ background: "var(--bg-card-hover)", color: "var(--accent)" }}
      aria-label={mins ? `${label} (${mins})` : label}
    >
      <svg aria-hidden="true" className="shrink-0" width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21" /></svg>
      <span>{label}</span>
      {mins ? <span style={{ color: "var(--text-muted)" }}>{`· ${mins}`}</span> : null}
    </button>
  );
}

function Missing() {
  return <span className="inline-block min-w-[3rem] text-center text-[11px]" style={{ color: "var(--text-muted)" }} aria-label="Not posted">&mdash;</span>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-xs font-medium" style={{ color: "var(--text)" }}>{label}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-[11px] font-semibold uppercase tracking-wide mt-4 mb-1" style={{ color: "var(--text-muted)" }}>{children}</h3>;
}

export default function MlbSeasonReviewModal({
  review,
  favoriteTeams,
  initialSection,
  onPlay,
  onClose,
}: {
  review: MlbReview;
  favoriteTeams: string[];
  initialSection?: MlbReviewSection | null;
  onPlay: (rec: MlbReviewRec, section: MlbReviewSection) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const season = review.season;

  useEffect(() => {
    // The Escape that closed the video is what brings this dialog back, and
    // React mounts it (and runs this effect) while that same event is still
    // bubbling up to window — so ignore any key pressed before the mount.
    const mountedAt = performance.now();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && e.timeStamp >= mountedAt) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus management + Tab trap, as PlayoffPictureModal does.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus({ preventScroll: true });
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === dialog) { e.preventDefault(); last.focus(); }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      opener?.focus?.();
    };
  }, []);

  // Land on the section the pill button named (or the one a video was played
  // from, when the dialog comes back after it).
  useEffect(() => {
    if (!initialSection || initialSection === "months") return;
    const el = dialogRef.current?.querySelector<HTMLElement>(`[data-review-section="${initialSection}"]`);
    el?.scrollIntoView({ block: "start" });
  }, [initialSection]);

  const { favorites, others } = sortTeamsForFavorites(review.teams, favoriteTeams);
  const months = review.months.filter((m) => m.top25 || m.oddities);
  const rounds = review.rounds.filter((r) => r.top10 || r.oddities);
  const play = (section: MlbReviewSection) => (rec: MlbReviewRec) => onPlay(rec, section);
  const teamButtons = (list: typeof review.teams) => (
    <div className="flex flex-wrap gap-1.5">
      {list.map((t) => <PlayButton key={t.slug} rec={t} label={t.subject} onPlay={play("teams")} />)}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative rounded-xl p-4 sm:p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-xl"
        style={{ background: "var(--bg)", border: "1px solid var(--border)", outline: "none" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`MLB ${season} in review`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-lg leading-none cursor-pointer"
          style={{ color: "var(--text-muted)" }}
        >
          ✕
        </button>
        <h2 className="text-base sm:text-lg font-bold pr-6" style={{ color: "var(--text)" }}>
          ⚾ {season} season in review
        </h2>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          MLB&rsquo;s own cuts, played here. No scores in the labels.
        </p>

        {months.length ? (
          <section data-review-section="months">
            <SectionTitle>Months</SectionTitle>
            {months.map((m) => (
              <Row key={m.order} label={m.label}>
                {m.top25 ? <PlayButton rec={m.top25} label="Top 25" onPlay={play("months")} /> : <Missing />}
                {m.oddities ? <PlayButton rec={m.oddities} label="Oddities" onPlay={play("months")} /> : <Missing />}
              </Row>
            ))}
          </section>
        ) : null}

        {rounds.length || review.postseasonTop25 ? (
          <section data-review-section="playoffs">
            <SectionTitle>Playoffs</SectionTitle>
            {rounds.map((r) => (
              <Row key={r.key} label={r.label}>
                {r.top10 ? <PlayButton rec={r.top10} label="Top 10" onPlay={play("playoffs")} /> : <Missing />}
                {r.oddities ? <PlayButton rec={r.oddities} label="Oddities" onPlay={play("playoffs")} /> : <Missing />}
              </Row>
            ))}
            {review.postseasonTop25 ? (
              <Row label="Postseason">
                <PlayButton rec={review.postseasonTop25} label="Top 25" onPlay={play("playoffs")} />
              </Row>
            ) : null}
          </section>
        ) : null}

        {review.yearEnd.length || review.teams.length ? (
          <section data-review-section="teams">
            {review.yearEnd.length ? (
              <>
                <SectionTitle>Best of {season}</SectionTitle>
                <div className="flex flex-wrap gap-1.5">
                  {review.yearEnd.map((y) => <PlayButton key={y.slug} rec={y} label={y.title ?? `Best of ${season}`} onPlay={play("teams")} />)}
                </div>
              </>
            ) : null}
            {favorites.length ? (
              <>
                <SectionTitle>Your teams</SectionTitle>
                <div data-review-favorites>{teamButtons(favorites)}</div>
                {others.length ? (
                  <>
                    <SectionTitle>Everyone else</SectionTitle>
                    {teamButtons(others)}
                  </>
                ) : null}
              </>
            ) : others.length ? (
              <>
                <SectionTitle>Stats &amp; Oddities</SectionTitle>
                {teamButtons(others)}
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
