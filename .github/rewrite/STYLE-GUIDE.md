# TUROS docs language and structure

Use this guide when writing or editing pages in this repository.

## One simple story

TUROS is the AI-ready data layer for sophisticated investors. It combines SEC Filing Data, Macro Data, Factor Data `Beta`, and Investment Analysis, available through MCP, one API, SDKs, the CLI, and the Excel Add-In `Alpha`.

Organize the story three ways:

- **Layer-first on the homepage:** explain the unified data layer.
- **Domain-first in navigation and docs:** name the four Products plainly.
- **Job-first in Workflows and inside product pages:** explain the investor work completed.

## Canonical taxonomy

- **Product:** SEC Filing Data; Macro Data; Factor Data `Beta`; Investment Analysis.
- **Workflows:** Research Companies; Track Investors; Track Company Events; Understand Macro; Analyze Portfolios.
- **Build with TUROS:** MCP; API; SDKs; CLI; Excel Add-In `Alpha`.
- **Status:** Fund Letters `Coming Soon`; never present it as publicly available until the live gate opens.

Do not recreate the old “Filings & companies” and “Intelligence & market data” groups.

## Language

Prefer direct behaviors:

- “Cites the underlying filing.”
- “Links to the original source.”
- “Keep the accession number and filing URL.”
- “Complex investment analysis, packaged into repeatable workflows.”

Avoid primary marketing phrases such as “source-backed,” “evidence layer,” “provenance,” “investing AI,” “first AI native,” and “find novel alpha.” Technical field names may remain when they are literal API schema fields.

Do not promise that every result has a citation. State the specific source fields returned by the capability.

## Pricing language

- Free test keys and 100 included live calls.
- The allowance is 100 included live calls each UTC calendar month and resets automatically on the first eligible request in a new month.
- Pay as you go from `$10`, with no self-serve subscription, monthly minimum, setup fee, or per-seat fee.
- Pay only for successful production work; test traffic and failures before work begins are free.
- Larger top-ups save up to 30%; paid credits do not expire under the current model.
- Use **Custom** for redistribution, enterprise controls, committed volume, support, and contractual SLAs.

Do not describe the allowance as a subscription or promise more than the confirmed 100-call monthly allowance. Do not market retired or grandfathered Pro, Team, or Commercial subscriptions as current public offers.

## Host policy

- Canonical docs: `https://www.turos.app/docs`.
- Current production API and MCP: `https://api.secapi.ai` and `https://api.secapi.ai/mcp`.
- `api.turos.app` becomes a default only after the documented parity gate passes.
- Existing host, key prefixes, package names, CLI commands, headers, and environment variables are compatibility contracts.
- `/docs/mcp` is the JSON transport; the human guide is `/docs/build/mcp`.

## Page anatomy

1. Exact frontmatter title and description.
2. One direct H1 and a one-to-three-sentence outcome.
3. Prerequisites or availability warning when needed.
4. A bounded workflow or working request.
5. Source, freshness, billing, and error boundaries relevant to that page.
6. Links to the next Product, Workflow, Build, or Pricing page.

Use curl as the common HTTP example. Send machine keys in `x-api-key`, pin `secapi-version` in production, and never place secrets in URLs, prompts, or repositories.
