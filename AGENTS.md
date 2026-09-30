<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Tests

- WebKit passes run on the mini: `~/scripts/pw-webkit-mini.sh <worktree> [spec…]` (add `--config FILE` for an override config, `--script FILE.mjs` for an ad-hoc read-back). Never add a `webkit` project to a laptop config; WebKit on the MacBook puts page windows in Mission Control. Override configs must honour `PLAYWRIGHT_BASE_URL` (spread `...base.use`, no hard-coded `baseURL`). Chromium passes stay local.
