// Serves the static export in out/ the way Cloudflare Pages does for the
// a11y suite: /faq → out/faq.html, /teams/x → out/teams/x/index.html, then the
// file itself, else out/404.html. No dependency (the CI runner has no `serve`
// cached), no worker: the spec answers /api/* and every feed itself.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..", "out");
const PORT = Number(process.env.PORT || 3100);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json",
};

async function isFile(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  const base = join(ROOT, path);
  const candidates = path.endsWith("/") ? [join(base, "index.html")] : [base, `${base}.html`, join(base, "index.html")];
  for (const file of candidates) {
    if (file.startsWith(ROOT) && await isFile(file)) {
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
      return res.end(await readFile(file));
    }
  }
  res.writeHead(404, { "content-type": TYPES[".html"] });
  res.end(await readFile(join(ROOT, "404.html")).catch(() => "Not found"));
}).listen(PORT, () => console.log(`a11y: serving out/ on http://localhost:${PORT}`));
