# Sitemap: current docs → Stedi-shaped TUROS docs

Sources: `autonomous-computer/docs` origin/main (`f1066d0`) and omni-datastream mintlify. ~158 guide pages + ~316 API endpoint pages compress into the IA below.

Header: **Guides** | **API Reference**
Sidebar hub toggle: **Developer Docs** | **Product Docs**
First sidebar link: **Changelog**

## Developer Docs (Guides)

| New path | Title | Distill from | Drop |
| --- | --- | --- | --- |
| `changelog.mdx` | Changelog | `changelog.mdx` | retitle product to TUROS |
| `index.mdx` | Developer Docs | `index.mdx`, `overview.mdx`, `api-overview.mdx` | duplicate CardGroups |
| `test-mode.mdx` | Test mode | `test-keys.mdx`, `non-billable.mdx`, `try-it.mdx`, `api-playground.mdx` | separate try-it pages |
| `account-setup.mdx` | Account setup | `getting-started.mdx`, dashboard half of `auth-and-pricing.mdx` | duplicate 10-K walkthrough |
| `ai/build-with-ai.mdx` | Build with AI | `give-this-prompt-to-your-agent.mdx`, `agent-operating-layer.mdx`, `custom-skills.mdx`, `clients/*`, `llms.txt` | persona prompt library |
| `ai/agent.mdx` | TUROS Agent | `agent-billing.mdx`, bootstrap in give-this-prompt, `api-reference/agent/*` | |
| `coverage/coverage.mdx` | Coverage | `coverage-and-depth.mdx`, `edgar-statistics.mdx`, `freshness-and-trust.mdx`, macro country table | benchmark marketing |
| `coverage/authentication.mdx` | Authentication | `auth-and-pricing.mdx`, `api-conventions.mdx`, `enterprise.mdx` | |
| `coverage/api-keys.mdx` | API keys | key sections of auth + enterprise | |
| `coverage/identifiers.mdx` | Identifiers | `resolve-then-fetch.mdx`, `products/entity.mdx`, `object-graph.mdx` | |
| `filings/overview.mdx` | Overview | `object-graph.mdx`, `first-request-flows.mdx` | |
| `filings/fetch-overview.mdx` | Overview | `products/filing-search.mdx`, `products/search.mdx` | |
| `filings/api-submission.mdx` | API submission | `first-request-flows.mdx`, filings endpoints | |
| `filings/dashboard-search.mdx` | Retrieve filings - dashboard | getting-started dashboard fragments (includes former dashboard-ui) | |
| `filings/batch.mdx` | Batch requests | `advanced-quickstarts.mdx`, pagination in conventions | |
| `filings/accession-lookup.mdx` | Accession and CIK lookup | `resolve-then-fetch.mdx`, filings by accession | |
| `filings/views.mdx` | Filing views | `views-and-includes.mdx` | |
| `filings/pdf.mdx` | Filing PDF | render/download/export, `seo/sec-pdf-download-api.mdx` facts only | SEO doorway |
| `filings/company.mdx` | Company overview, identifiers, listings | companies overview | |
| `filings/financials.mdx` | Financial statements | `business-breakdown.mdx`, statements/facts | |
| `filings/ownership.mdx` | Ownership and insiders | `products/ownership.mdx`, ownership/compensation workflows | 13F/insider tutorials as pages |
| `filings/sections.mdx` | Sections and exhibits | `filing-types-and-exhibits.mdx`, section routes | |
| `filings/troubleshooting.mdx` | Troubleshooting | `troubleshooting.mdx`, `request-diagnostics.mdx`, `error-code-catalog.mdx` | |
| `filings/form-types.mdx` | Form types | `filing-types-and-exhibits.mdx`, forms group | |
| `filings/entity-resolution.mdx` | Entity resolution | `resolve-then-fetch.mdx`, `products/entity.mdx` | |
| `situations/checks.mdx` | Special situations search | `products/special-situations.mdx`, `special-situations-workflows.mdx` | |
| `situations/interpret.mdx` | Interpret situation response | same | |
| `situations/troubleshooting.mdx` | Troubleshooting | same + error catalog | |
| `mcp.mdx` | Model Context Protocol (MCP) | `mcp-install.mdx`, `mcp-workflows.mdx` | evaluate MCP doorway |
| `intelligence/overview.mdx` | Overview | `investment-intelligence.mdx`, `named-intel-jobs.mdx` | |
| `intelligence/test-workflows.mdx` | Test intelligence workflows | test-keys + intel billing | |
| `intelligence/company.mdx` | Company intelligence | `products/intelligence.mdx` | |
| `intelligence/factors.mdx` | Factor intelligence | factor-* pages + methodology trio | |
| `intelligence/macro.mdx` | Macro intelligence | `macro-intelligence.mdx`, `macro-tier1.mdx` | |
| `intelligence/market.mdx` | Market data | `market-data.mdx`, `market-calendar.mdx` | |
| `intelligence/artifacts-overview.mdx` | Overview | `artifact-operations.mdx` | |
| `intelligence/artifacts-setup.mdx` | Setup | same | |
| `intelligence/artifacts-create.mdx` | Create artifacts | same | |
| `intelligence/artifacts-retrieve.mdx` | Retrieve artifacts | same | |
| `intelligence/status.mdx` | Check job status | named-intel-jobs, query jobId | intelligence webhooks folded into status + events/configure |
| `intelligence/views.mdx` | Intelligence views | products/intelligence | |
| `intelligence/event-types.mdx` | Event types | webhook + monitors events | |
| `events/configure.mdx` | Configure and test | webhook-stream-workflows, SLA, delivery-audit | |
| `events/deliveries.mdx` | Deliveries and retries | same + `stream-polling.mdx` | |
| `events/events.mdx` | Events | event types | |
| `organizations/overview.mdx` | Overview | `enterprise.mdx`, `enterprise-commercial.mdx` | merge duplicates |
| `organizations/setup.mdx` | Setup | same | |
| `admin/billing.mdx` | Billing and pricing | plans, payg, billing-faq, payg-calculator | evaluate pricing doorway |
| `admin/notifications.mdx` | Notifications | monitors email, webhook failure notes | |
| `admin/trust-center.mdx` | Trust Center | freshness-and-trust, status.mdx | |
| `admin/support.mdx` | Support | status escalation, request-diagnostics | |
| `sdks/javascript.mdx` | JavaScript SDK | `javascript-sdk.mdx` | duplicate situations walkthrough |
| `sdks/python.mdx` | Python SDK | `python-sdk.mdx` | same |
| `sdks/go.mdx` | Go SDK | `go-sdk.mdx` | |
| `sdks/rust.mdx` | Rust SDK | `rust-sdk.mdx` | |
| `sdks/cli.mdx` | CLI | `cli.mdx`, `libraries-and-sdks.mdx` | |

## Product Docs

| New path | Title | Distill from |
| --- | --- | --- |
| `product/index.mdx` | Product Docs | hub, portal-first |
| `product/account-setup.mdx` | Set up your account | getting-started dashboard |
| `product/billing.mdx` | Billing and pricing | payg + plans UI |
| `product/filings.mdx` | Review filings | views + dashboard |
| `product/situations.mdx` | Special situations | embed/situations public |
| `product/monitors.mdx` | Monitors | `monitors.mdx` |
| `product/webhooks.mdx` | Webhooks | webhook dashboard |
| `product/support.mdx` | Support | support |

## API Reference

| New path | Title |
| --- | --- |
| `api-reference/index.mdx` | Introduction |

Keep existing OpenAPI endpoint MDX when applying. Relabel sidebar groups to Stedi style (`METHOD Name`). Delete empty groups: Dashboard, Diagnostics, Model Portfolios, Observability.

## Redirect everything else

`seo/*` (20), `compare-*`, `benchmark-*`, `migrate-from-*` (optional single migrate page later), `for-*` personas, `evaluate/*`, `tutorials/*`, `agents/prompt-library/*`, `index`/`overview`/`api-overview` extras, `try-it`, `api-playground`, `enterprise-commercial` → organizations + billing.
