"use client";

import { useEffect, useState } from "react";
import { Sport } from "@/lib/types";
import { NewsItem } from "@/lib/news";

export interface NewsSource {
  label: string;
  fetch: () => Promise<NewsItem[]>;
}

interface NewsColumnProps {
  title: string;
  sources: NewsSource[];
  // 3rd-column selector — same dropdown UX as the scores view.
  swappableOptions?: { sport: Sport; label: string }[];
  selectedThirdLeague?: Sport;
  onSwapLeague?: (sport: Sport | undefined) => void;
}

function SourceCard({ label, items, loading }: { label: string; items: NewsItem[]; loading: boolean }) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div
        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide"
        style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}
      >
        {label}
      </div>
      {loading ? (
        <div className="flex flex-col">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="px-3 py-2 animate-pulse" style={{ borderTop: i === 1 ? "none" : "1px solid var(--border)" }}>
              <div className="h-3 w-full rounded" style={{ background: "var(--bg-card-hover)" }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-3 py-3 text-xs text-center" style={{ color: "var(--text-muted)" }}>No headlines</p>
      ) : (
        <div className="flex flex-col">
          {items.map((item, idx) => (
            <a
              key={item.id}
              href={item.articleUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 text-xs sm:text-sm leading-snug transition-colors hover:bg-[var(--bg-card-hover)]"
              style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border)", color: "var(--text)" }}
            >
              {item.headline}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceSection({ source }: { source: NewsSource }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    source.fetch().then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [source]);

  return <SourceCard label={source.label} items={items} loading={loading} />;
}

export default function NewsColumn({
  title,
  sources,
  swappableOptions,
  selectedThirdLeague,
  onSwapLeague,
}: NewsColumnProps) {
  const [swapOpen, setSwapOpen] = useState(false);
  const isSwappable = swappableOptions && swappableOptions.length > 0 && onSwapLeague;

  return (
    <div className="flex-1 min-w-0 max-w-[225px] xl:max-w-[280px] min-h-[60vh]">
      <div
        className="league-sticky-top flex flex-col items-center pb-2 sm:pb-3 sticky z-30"
        style={{ background: "var(--bg)", paddingTop: "1.75rem" }}
      >
        <div className="flex items-center justify-center">
          <span className="text-sm invisible mr-1.5" aria-hidden="true">★</span>
          {isSwappable ? (
            <div className="relative">
              <button
                onClick={() => setSwapOpen(!swapOpen)}
                className="flex items-center gap-0.5 cursor-pointer transition-colors hover:opacity-80"
                style={{ color: "var(--text)" }}
                title="Switch news feed"
              >
                <h2 className="text-base sm:text-lg font-bold tracking-wide">{title}</h2>
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform duration-150 ${swapOpen ? "rotate-180" : ""}`}
                  style={{ color: "var(--text-muted)" }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {swapOpen && (
                <div
                  className="absolute top-full mt-1 right-1/2 translate-x-1/2 rounded-lg shadow-lg z-50 py-1 min-w-[120px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
                >
                  <button
                    onClick={() => { onSwapLeague!(undefined); setSwapOpen(false); }}
                    className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                    style={{
                      color: !selectedThirdLeague ? "var(--accent)" : "var(--text)",
                      fontWeight: !selectedThirdLeague ? 600 : 400,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    Top Headlines
                  </button>
                  {swappableOptions!.map((opt) => (
                    <button
                      key={opt.sport}
                      onClick={() => { onSwapLeague!(opt.sport); setSwapOpen(false); }}
                      className="w-full px-3 py-1.5 text-xs text-left cursor-pointer transition-colors"
                      style={{
                        color: opt.sport === selectedThirdLeague ? "var(--accent)" : "var(--text)",
                        fontWeight: opt.sport === selectedThirdLeague ? 600 : 400,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <h2 className="text-base sm:text-lg font-bold tracking-wide" style={{ color: "var(--text)" }}>
              {title}
            </h2>
          )}
          <span className="text-sm invisible ml-1.5" aria-hidden="true">★</span>
        </div>
        <span
          className="text-[9px] sm:text-[10px] italic mt-0.5 block"
          style={{ color: "transparent" }}
        >
          {"\u00A0"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 sm:gap-2">
        {sources.map((source) => (
          <SourceSection key={source.label} source={source} />
        ))}
      </div>
    </div>
  );
}
