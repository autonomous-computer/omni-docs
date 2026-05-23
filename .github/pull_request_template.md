## Summary

<!-- What changed and why. One paragraph max. Link issues with "Closes #". -->

Closes #

## Scope

<!-- Check ALL areas this PR touches. Reviewers and CI use this to gauge blast radius. -->

- [ ] `docs.json` — Mintlify navigation, theme, redirects, API config, SEO, footer
- [ ] `openapi/` — OpenAPI source used by the API reference and playground
- [ ] `getting-started/` / `quickstart.mdx` — Onboarding flow
- [ ] `core-concepts/` — Conceptual / explanation pages
- [ ] `customisation/` — Theming and customization docs
- [ ] `agent-backend/` — Agent backend docs
- [ ] `omni-intelligence/` — OMNI Intelligence product docs
- [ ] `skills/` — Skills system docs
- [ ] `sources/` / `statuses/` / `labels/` — Reference content
- [ ] `hooks/` — Hooks reference
- [ ] `go-further/` — Advanced topics
- [ ] `architecture.mdx` / `index.mdx` / `troubleshooting.mdx` — Top-level pages
- [ ] `logo/` / `favicon.svg` / `style.css` — Branding / styling
- [ ] `.github/` — Workflows / automation

## Changes

<!-- Bullet points grouped by area. Be specific — diffs are for code, this is for intent. -->

-
-

## Verification

<!-- What you ran locally. Paste actual commands and their outcomes. -->

```bash
mintlify dev            # ✅ / ❌  smoke renders without errors
mintlify broken-links   # ✅ / ❌
```

<details>
<summary>Additional verification (expand if applicable)</summary>

```bash
# OpenAPI lint
npx @redocly/cli lint openapi/*.json

# Search for legacy brand or path references
rg -n "<legacy-pattern>" .
```

</details>

## Deployment Impact

<!-- Skip this section entirely for code-only changes with no infra impact. -->

- [ ] Mintlify deploy expected (auto on merge to `main`)
- [ ] Navigation / sidebar changes
- [ ] OpenAPI / API playground changes
- [ ] Redirects or removed pages
- [ ] SEO metadata, sitemap, or canonical URL changes
- [ ] Logo / theme / branding changes

## Completion Attestation

<!-- You MUST select one. This is a binding statement of delivery status. -->

- [ ] **100% complete, 100% functional.** All docs render correctly, links resolve, navigation is consistent, and changes are deployment-ready. No outstanding work remains.
- [ ] **Not fully complete or functional.** Deltas listed below.

### Deltas (only if attesting incomplete)

<!-- Short bullets. Items intentionally deferred from this PR's stated scope. -->

-

## Screenshots / Demo

<!-- For UI changes (navigation, theming, new pages). Delete section if not applicable. -->

---

<details>
<summary>Agent Context</summary>

<!-- This section is for AI coding agents that may continue or review this work.
     Fill in what's relevant; delete what isn't. -->

**Key files to read first:**
<!-- List the 3-5 most important files for understanding this PR's changes. -->
- `docs.json`
-

**Decisions made:**
<!-- Non-obvious choices and why. Agents should not re-litigate these. -->
-

**Relevant docs:**
- `architecture.mdx`
- `index.mdx`

**Conventions applied:**
<!-- Mintlify component usage, frontmatter conventions, openapi field naming. -->
-

</details>
