# TUROS developer-docs sitemap

The docs have two tabs: **Guides** and **API Reference**. Changelog remains a global anchor.

## Guides

| Group | Pages |
| --- | --- |
| Start Here | Overview; Quickstart; Test mode; Authentication; API keys; Pricing and billing |
| Product | SEC Filing Data; Macro Data; Factor Data `Beta`; Investment Analysis |
| Workflows | Research Companies; Track Investors; Track Company Events; Understand Macro; Analyze Portfolios |
| Build with TUROS | MCP; API; SDKs; CLI; Excel Add-In `Alpha`; agent-building guides |
| Coverage & Operations | Coverage; Identifiers; events and delivery; organizations; trust; support; retained detailed guides |
| Migration | SECAPI.ai to TUROS; API versioning and compatibility |

## New canonical guide routes

- `/pricing`
- `/workflows/research-companies`
- `/workflows/track-investors`
- `/workflows/track-company-events`
- `/workflows/understand-macro`
- `/workflows/analyze-portfolios`
- `/build/mcp`
- `/build/api`
- `/build/sdks`
- `/build/excel-add-in`
- `/migration/secapi`

The canonical product fronts remain `/filings/overview`, `/intelligence/macro`, `/intelligence/factors`, and `/intelligence/overview` to preserve useful deep URLs.

## Reserved and generated routes

- `/docs/mcp` is the JSON MCP transport, not a human page.
- `/docs/build/mcp` is the human MCP guide.
- `/api-reference` and endpoint descendants are generated from `openapi/sec-api-public.v1.json`.
- This release may update the OpenAPI title, description, server explanation, contact, and external-docs link. Endpoint-by-endpoint copy remains owned by the contract/reference stream.

## Machine-readable surfaces

- `/docs/llms.txt` is the concise product, workflow, build, pricing, and migration index.
- Mintlify supplies page-level Markdown and the generated full-corpus representation; do not hand-maintain a contradictory `llms-full.txt`.
- API availability comes from the live catalog, not route presence alone.
