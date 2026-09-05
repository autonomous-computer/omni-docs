# Facts that must survive (do not invent)

Source: the live TUROS contract, `omni-datastream`, and the approved TUROS Data & Intelligence positioning plan. If a fact is not here or in the current OpenAPI/catalog, do not add a capability.

## Hosts

- Product / dashboard: `https://www.turos.app` (signup, login, keys, billing, monitors, webhooks).
- Docs destination: TUROS docs (this tree). `docs.secapi.ai` and secapi.ai docs URLs will redirect here.
- Live HTTP API: `https://api.turos.app` — use this host in every curl, MCP snippet, and discovery default.
- Compatibility alias: `https://api.secapi.ai` — permanently supported for existing integrations, same methods/auth/billing. Never describe it as deprecated, never give it an end date, and never say requests are redirected between hosts. Mention it only where a reader may hold an existing `api.secapi.ai` integration.
- MCP: `https://api.turos.app/mcp`
- Health: `https://api.turos.app/healthz`, `/readyz`
- Status: `https://status.turos.app`
- OpenAPI: `openapi/sec-api-public.v1.json`
- Discovery: `/.well-known/api-catalog.json`, `agent-card.json`, `mcp-server-card.json`, `llms.txt`

## Auth

- Machine requests: `x-api-key` header only. Not `Authorization: Bearer`. Not in URL, body, or browser JS.
- Version header: `secapi-version: 2026-03-19`. Response: `SECAPI-Version`.
- Keys: `secapi_test_…` (`livemode: false`, free, fixture-only) and `secapi_live_…` (`livemode: true`, bills successful work). Prefix is the mode.
- `keyPrefix` = first 20 characters. Secret shown once.
- Env: `export SECAPI_API_KEY="secapi_..."`
- Dashboard session (WorkOS) for: create/reveal/rotate/revoke keys, billing, monitors, webhook endpoint CRUD / secret rotation.
- API key cannot create keys or change billing.
- SSO: SAML/OIDC via WorkOS (Okta, Azure AD, Google Workspace) on enterprise.
- MCP OAuth discovery: `/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`
- Scopes (enterprise key mgmt): `read:sec`, `write:sec`, `admin:operator`
- Key routes: `GET/POST /v1/api_keys`, `DELETE /v1/api_keys/:keyId` (dashboard session / bearer org, not an API key)
- Agent bootstrap: `POST /v1/agent/bootstrap_tokens` (sponsor, human-authorized) then `POST /v1/agent/bootstrap` (agent exchange)
- Monitor create (`POST /v1/monitors`) and `PUT /v1/billing/budget` are dashboard-session (bearer org). `GET /v1/monitors` accepts an API key.
- Rotation: create → deploy → verify `GET /v1/limits` → revoke. Leak: revoke first.

## First request

```bash
curl --fail-with-body -sS \
  -H "x-api-key: $SECAPI_API_KEY" \
  -H "secapi-version: 2026-03-19" \
  "https://api.turos.app/v1/entities/resolve?ticker=AAPL&view=agent"
```

Then latest 10-K:

```bash
curl --fail-with-body -sS \
  -H "x-api-key: $SECAPI_API_KEY" \
  -H "secapi-version: 2026-03-19" \
  "https://api.turos.app/v1/filings/latest?ticker=AAPL&form=10-K&view=agent"
```

Preserve when present: `accessionNumber`, `form`, `filingDate`, `filingUrl`, `requestId`. Do not infer a CIK from a ticker or an old filing URL. Latest-filing results are time-dependent.

`401 missing_api_key` vs `401 authentication_failed`. Do not switch to bearer to "fix" either.

`view=agent` is a compact projection. `view=default|compact|agent`. `include=` is opt-in expand.

## Billing

- Free test keys plus 100 included live calls each UTC calendar month. The allowance resets automatically on the first eligible request in a new month. Do not describe the allowance as a subscription or promise more than the confirmed 100-call monthly allowance.
- PAYG: prepaid credits from $10; enable in the dashboard. No self-serve subscription, monthly minimum, setup fee, or per-seat fee.
- Top-up examples: fund $50 for $45 (10%); $250 for $200 (20%); $1,000 for $700 (30%). Paid credits do not expire under the current model. Auto top-up uses the same bands.
- Custom: redistribution, embedding, white-label, resale, bulk exports, enterprise controls, committed volume, dedicated support, and contractual SLAs.
- Legacy or grandfathered plan keys may still appear in runtime schemas. They are compatibility facts, not public self-serve offers.
- Resolve = `$0.01`.
- Intel pack `$0.50` (`deal_brief`, `letter_brief`, `filing_brief`, `move_brief`). Intel report `$1.50` (`country_report`, `portfolio_review`, `strategy`, `underwriting_pack`). Channel is not a discount. Billed once on successful named-job completion. `202`/polls/failures/cache hits not billed.
- Meters: `light_reads`, `standard_reads`, `heavy_extracts`, `artifact_jobs`, `delivery_events`, `email_notifications`, `intelligence_queries`, `market_data_reads`, `semantic_search`.
- `ai_queries` quota; sandbox trial 10/mo. Headers `SECAPI-AI-Quota-*`.
- Grant advisory from 80%: `SECAPI-Grant-Status/Consumed-Percent/Remaining/Warning/Action/Action-Url`.
- `GET /v1/billing`, `/v1/limits`, `/v1/billing/rates` (public), `POST /v1/billing/quote` (not a reservation), and `PUT /v1/billing/budget`.
- `Idempotency-Key` on billable POSTs: 24h replay, `422` body mismatch, `409` + `Retry-After` in flight.
- Non-billable: health, quote, limits, catalog, test-key traffic, 4xx before work starts.
- `402 billing_required` with `details.reason` (e.g. `starter_grant_exhausted`). Branch on reason, not message text.
- Pay as you go = evaluation and internal use only. Custom terms govern redistribution and embedding.

## Coverage

- Filings: nine-year searchable floor; completeness checks for required forms for the two most recently completed years; current year as filings arrive.
- Macro launch countries: US, CN, JP, TW, IL. Expansion: CA, GB, EZ, KR, BR, IN, SA.
- Gated stores (fund letters, authenticated situations) return 404 when dark — check `availability` on `/.well-known/api-catalog.json`.
- CUSIP/ISIN are licensed; unlicensed accounts get `null` + `licensed_identifier_required`. Ticker/CIK/FIGI need no license. Tickers can be reused or changed.
- Dilution and `GET /v1/companies/segments` are beta (`SECAPI-Maturity: beta`).
- Do not claim equal data density across EDGAR.

## Product and workflow map

- Product: SEC Filing Data; Macro Data; Factor Data `Beta`; Investment Analysis.
- Workflows: Research Companies; Track Investors; Track Company Events; Understand Macro; Analyze Portfolios.
- Build with TUROS: MCP; API; SDKs; CLI; Excel Add-In `Alpha`.
- Fund Letters is live on the production API (`OMNI_FUND_LETTERS_ENABLED` is on). Documented coverage begins with Q1 2025 and is not a comprehensive historical archive. The separate public embed surface (`/v1/embed/letters`) remains gated.
- Entity → filing → fact/statement/event; factor; position; snapshot; observation. Investment Analysis packages available data into repeatable workflows; it is not another dataset.

## MCP

- `GET /mcp` public discovery. `POST /mcp` authenticated JSON-RPC with `x-api-key`.
- `claude mcp add --transport http secapi https://api.turos.app/mcp --header "x-api-key: $SECAPI_API_KEY"`
- `secapi mcp install --client <claude-code|claude-desktop|cursor|windsurf|project>`
- `tools.search` / `tools.describe` via `tools/call`. No batch JSON-RPC.
- Errors: `-32004` execution budget, `-32005` AI-query/MCP quota, `-32006` tool protection.

## SDKs

- JS: `@secapi/sdk-js` (Node ≥18)
- Python: `secapi-client` (Python ≥3.11)
- Go, Rust SDKs exist
- CLI: `@secapi/cli` (`secapi`, compat alias `omni-sec`)
- `SecApiError` with `status`/`code`/`requestId`. Honor `Retry-After`.

## Delivery

- Webhooks: verify `x-secapi-signature` on raw body; reject stale timestamps; at-least-once; manual replay. Automatic retry/auto-pause are rollout-gated.
- Streams: `GET /v1/stream_subscriptions/{id}/events?limit=25` → `data`, `nextCursor`, `replayCursor`. Commit cursor after durable write. Order is recorded event order, not SEC filing timestamp.
- Monitors: hourly sweep; 100 sends/monitor/hour, 1,000/org/day; `monitor.match`; email metered as `email_notifications`. Prefer dashboard for create/edit unless OpenAPI proves `POST /v1/monitors`.
- Special situations: free anonymous preview `/v1/embed/situations` (CORS, no key, capped) vs paid `/v1/situations`. Public browser at situations on the site.

## Errors

- `400` correct the request, `401` credential, `402` account state, `403` entitlement, `429` honor `Retry-After`, `5xx` bounded backoff.
- Retain `Request-Id`, `traceparent`, `SECAPI-Meter-Class`, `SECAPI-Estimated-Cost`, `SECAPI-Token-Count`.

## Do not write

- Vendor names in user-facing docs (source-disclosure policy). SEC/EDGAR/exchanges/publishers are fine.
- Capabilities not listed above (SFTP, paper claims, PHI, payers, 270/271, etc.).
- `Authorization: Bearer` as the machine auth story.
- Equal-coverage claims, legal conclusions from `violation_type`, 13F as a real-time ledger.
