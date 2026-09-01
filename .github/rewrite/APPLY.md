# TUROS docs release notes

This repository deploys the developer documentation at `https://www.turos.app/docs`.

## Release contents

- One Developer Docs experience with **Guides** and **API Reference** tabs.
- Guides organized as Start Here, Product, Workflows, Build with TUROS, Coverage & Operations, and Migration.
- Four Product front doors and five investor Workflow guides.
- Dedicated MCP, API, SDK, Excel `Alpha`, pricing, and SECAPI.ai migration guides.
- MCP human-guide aliases point to `/build/mcp`; `/docs/mcp` remains the JSON transport.
- `llms.txt` and Mintlify Markdown page representations use the same names, status labels, pricing boundary, and host policy.
- Generated endpoint pages remain OpenAPI-owned. The core docs release owns global API identity and validates the generated output; it does not rewrite endpoint pages individually.

## Coordinated release gate

1. Merge human and machine-readable docs together.
2. Verify navigation, links, redirects, Markdown page variants, `llms.txt`, and OpenAPI rendering in preview.
3. Confirm `api.secapi.ai` remains the base URL in working examples.
4. Deploy the linked marketing, docs, and API-contract changes as one coordinated release.
5. Verify production at `www.turos.app/docs`, including `/docs/build/mcp` as HTML and `/docs/mcp` as JSON.
6. Apply legacy SECAPI.ai documentation redirects only after the destination pages are live.

Do not switch examples or discovery defaults to `api.turos.app` until the cross-host parity gate passes.
