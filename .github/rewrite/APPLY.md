# Apply / staging notes (omni-docs)

This branch is the Stedi-shaped TUROS docs rewrite, staged in **this repo** because Mintlify deploys `docs.turos.app` from `autonomous-computer/omni-docs`.

Theme, colors, and logo still belong in the Mintlify dashboard (and `logo/`, `favicon.svg`, `style.css` here). This PR changes content and navigation, not the live theme tokens.

## What landed

- Guides / API Reference / Product Docs tabs (Stedi Developer vs Provider hubs)
- Changelog as the first sidebar anchor
- Compressed SEC API docs (from `autonomous-computer/docs`) rewritten in Stedi voice
- Existing OMNI agent/platform MDX is **left on disk** but removed from nav. Redirects cover the highest-traffic old paths.
- Rewrite notes: `.github/rewrite/` (`STYLE-GUIDE.md`, `FACTS.md`, `SITEMAP.md`)

## After merge

1. Confirm Mintlify is still connected to this repo (not `autonomous-computer/docs` — that site is `docs.secapi.ai`).
2. Apply dashboard theme updates.
3. Point `docs.secapi.ai` redirects at `docs.turos.app` when you are ready to deprecate secapi.ai docs.
4. Curl samples still use `https://api.secapi.ai` until the API hostname cutover.
