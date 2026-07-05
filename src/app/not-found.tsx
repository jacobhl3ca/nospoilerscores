import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page Not Found | HideScore",
  description: "Sorry, we couldn't find that page. Head back to HideScore for spoiler-free sports scores and highlights.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* The big "404" is decorative — the descriptive <h1> below is the page's
          real heading, so a screen reader navigating by heading lands on
          "Page not found" instead of a bare, meaningless number. This matches
          every other page's descriptive h1 ("Privacy Policy", "Frequently
          asked questions", …); the 404 page was the lone outlier. Tailwind's
          preflight resets heading font-size/weight to inherit, so the tag swap
          is purely semantic — the layout renders pixel-for-pixel unchanged. */}
      <div aria-hidden="true" className="text-4xl font-bold mb-2">404</div>
      <h1 className="mb-4" style={{ color: "var(--text-muted)" }}>Page not found</h1>
      <Link
        href="/"
        className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--accent)" }}
      >
        Back to HideScore
      </Link>
    </main>
  );
}
