export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <h1 className="text-4xl font-bold mb-2">404</h1>
      <p className="mb-4" style={{ color: "var(--text-muted)" }}>Page not found</p>
      <a
        href="/"
        className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--accent)" }}
      >
        Back to HideScore
      </a>
    </div>
  );
}
