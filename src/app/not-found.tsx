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
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>Page not found</p>
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
