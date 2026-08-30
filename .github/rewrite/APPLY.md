# Apply / staging notes (omni-docs)

This branch is the Stedi-shaped TUROS docs rewrite, staged in **this repo** because Mintlify deploys `docs.turos.app` from `autonomous-computer/omni-docs`.

Theme, colors, and logo still belong in the Mintlify dashboard (and `logo/`, `favicon.svg`, `style.css` here). This PR changes content and navigation, not the live theme tokens.

## What landed

- Sidebar hub toggle: **Developer Docs** | **Product Docs** (Mintlify dropdowns). Header tabs under Developer Docs: **Guides** | **API Reference**.
- Changelog as the first global sidebar anchor (`/changelog`)
- API Reference wired to `openapi/sec-api-public.v1.json` (METHOD + path endpoint pages, grouped by resource). Family overview MDX stays as the first page in each shipped group.
- Compressed SEC API docs rewritten in Stedi voice
- Existing OMNI agent/platform MDX is **left on disk** but removed from nav. Redirects cover old omni-docs paths and distilled secapi.ai paths.
- `llms.txt` at the repo root. OpenAPI served at `/openapi/sec-api-public.v1.json`.
- Cutover map (do not apply until this PR is live): `.github/rewrite/SECAPI-REDIRECTS.md`
- Rewrite notes: `.github/rewrite/` (`STYLE-GUIDE.md`, `FACTS.md`, `SITEMAP.md`)

## After merge

1. Confirm Mintlify is still connected to this repo (not `autonomous-computer/docs` — that site is `docs.secapi.ai`).
2. Apply dashboard theme updates.
3. Point `docs.secapi.ai` redirects at `docs.turos.app` when you are ready to deprecate secapi.ai docs.
4. Curl samples still use `https://api.secapi.ai` until the API hostname cutover.

The OpenAPI copy at `openapi/sec-api-public.v1.json` is the public spec plus Mintlify-only patches: path-based `operationId`s, summaries capped at 72 characters (full text moved into `description`), and `x-mint.href` so endpoint URLs stay `/api-reference/{family}/{method}-{path}`. Do not treat those patches as API contract changes.
