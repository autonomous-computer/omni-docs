# docs.secapi.ai → docs.turos.app path map

Apply these **after** omni-docs PR #36 is merged and live on docs.turos.app.
Do not flip DNS or Cloudflare bulk redirects while this rewrite is still a draft.

Host rule: `docs.secapi.ai` 301 → `https://docs.turos.app` + mapped path.
Unmapped paths: 301 to `https://docs.turos.app/`.

API host stays `https://api.secapi.ai` until a separate API hostname cutover.

| Source path | Destination |
| --- | --- |
| `/overview` | `/index` |
| `/api-overview` | `/api-reference` |
| `/getting-started` | `/account-setup` |
| `/test-keys` | `/test-mode` |
| `/non-billable` | `/test-mode` |
| `/try-it` | `/test-mode` |
| `/api-playground` | `/test-mode` |
| `/auth-and-pricing` | `/coverage/authentication` |
| `/api-conventions` | `/api-reference` |
| `/api-versioning` | `/api-reference` |
| `/enterprise` | `/organizations/overview` |
| `/enterprise-commercial` | `/organizations/overview` |
| `/coverage-and-depth` | `/coverage/coverage` |
| `/edgar-statistics` | `/coverage/coverage` |
| `/freshness-and-trust` | `/coverage/coverage` |
| `/resolve-then-fetch` | `/coverage/identifiers` |
| `/object-graph` | `/filings/overview` |
| `/first-request-flows` | `/filings/api-submission` |
| `/advanced-quickstarts` | `/filings/batch` |
| `/views-and-includes` | `/filings/views` |
| `/filing-types-and-exhibits` | `/filings/form-types` |
| `/request-diagnostics` | `/filings/troubleshooting` |
| `/error-code-catalog` | `/filings/troubleshooting` |
| `/products/entity` | `/filings/entity-resolution` |
| `/products/filing-search` | `/filings/fetch-overview` |
| `/products/search` | `/filings/fetch-overview` |
| `/products/ownership` | `/filings/ownership` |
| `/products/special-situations` | `/situations/checks` |
| `/products/intelligence` | `/intelligence/overview` |
| `/special-situations-workflows` | `/situations/checks` |
| `/investment-intelligence` | `/intelligence/overview` |
| `/named-intel-jobs` | `/intelligence/overview` |
| `/macro-intelligence` | `/intelligence/macro` |
| `/macro-tier1` | `/intelligence/macro` |
| `/market-data` | `/intelligence/market` |
| `/market-calendar` | `/intelligence/market` |
| `/artifact-operations` | `/intelligence/artifacts-overview` |
| `/mcp-install` | `/mcp` |
| `/mcp-workflows` | `/mcp` |
| `/javascript-sdk` | `/sdks/javascript` |
| `/python-sdk` | `/sdks/python` |
| `/go-sdk` | `/sdks/go` |
| `/rust-sdk` | `/sdks/rust` |
| `/cli` | `/sdks/cli` |
| `/libraries-and-sdks` | `/sdks/javascript` |
| `/webhook-stream-workflows` | `/events/configure` |
| `/webhook-delivery-audit` | `/events/deliveries` |
| `/webhook-sla` | `/events/deliveries` |
| `/stream-polling` | `/events/deliveries` |
| `/monitors` | `/product/monitors` |
| `/billing-faq` | `/admin/billing` |
| `/payg` | `/admin/billing` |
| `/plans` | `/admin/billing` |
| `/give-this-prompt-to-your-agent` | `/ai/build-with-ai` |
| `/agent-operating-layer` | `/ai/agent` |
| `/custom-skills` | `/ai/build-with-ai` |
| `/agent-billing` | `/ai/agent` |
| `/business-breakdown` | `/filings/financials` |
| `/methodology-registry` | `/intelligence/factors` |
| `/audit-logs` | `/events/deliveries` |
| `/status` | `/admin/trust-center` |
| `/openapi/sec-api.v1.json` | `/openapi/sec-api-public.v1.json` |
| `/.well-known/api-catalog` | `/.well-known/api-catalog.json` |
| `/evaluate/sec-filing-search-api` | `/filings/fetch-overview` |
| `/evaluate/xbrl-facts-api` | `/filings/financials` |
| `/evaluate/13f-api` | `/filings/ownership` |
| `/evaluate/insider-trading-api` | `/filings/ownership` |
| `/evaluate/sec-filings-mcp-server` | `/mcp` |
| `/evaluate/sec-filing-rag` | `/ai/build-with-ai` |
| `/evaluate/pricing-and-limits` | `/admin/billing` |
| `/for-investment-managers` | `/index` |
| `/for-hedge-funds` | `/index` |
| `/compare-sec-api` | `/index` |
| `/benchmark-sec-api` | `/index` |
| `/seo/sec-pdf-download-api` | `/filings/pdf` |
| `/seo/sec-edgar-api` | `/filings/overview` |
| `/seo/13f-data-api` | `/filings/ownership` |
