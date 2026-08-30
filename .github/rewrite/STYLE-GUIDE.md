# TUROS docs style guide (from Stedi)

Compiled from live Stedi Developer Docs, Provider Docs, API Reference, and changelog. Use this when writing or editing any page in this tree.

Brand actor in our docs is **TUROS** (where Stedi would say "Stedi"). Dashboard = **the TUROS dashboard**. HTTP API = **the TUROS API**. Regulator and filing source stay **SEC** / **EDGAR**.

## Navigation to match

- Header tabs (Developer Docs): **Guides** | **API Reference**
- Sidebar two-hub toggle: **Developer Docs** | **Product Docs** (Stedi: Developer Docs | Provider Docs). Implemented as Mintlify `navigation.dropdowns`.
- First sidebar link: **Changelog** (global anchor, `/changelog`)
- Then ungrouped: Developer Docs (hub), Test mode, Account setup
- Group names: sentence case, `&` not "and" (`Filings & companies`, `Coverage & access`)
- Section landings are titled **Overview**; the group name supplies context
- Task groups use verb phrases (`Fetch filings`, `Query intelligence`); concept groups use noun phrases (`Administrative`, `Event destinations`)
- API Reference sidebar: group by resource, items labeled `METHOD Title Case Name` (`GET Resolve Entity`)
- Product Docs is portal-first (dashboard clicks, not curl)
- Every page: frontmatter title + description, H1, short context, then work

## Text pages

### Titles

- Sentence case. Proper nouns keep caps (`Trust Center`, `TUROS Agent`, `Model Context Protocol (MCP)`).
- Verb-led for tasks (`Set up account and security`). Noun-led for concepts (`Test mode`, `Billing and pricing`).
- Section landings: H1 is `Overview`.

### Opening

Context before any step. 1–3 sentences. Observed openers:

1. "Learn how to…"
2. Definition-first ("Test mode provides a separate test environment…")
3. Capability ("You can…" / "TUROS allows you to…")

Never open with a numbered step.

### Headings

- H2 = feature area (`Accounts`, `Members`). H3 = task (`Create an account`, `Invite members`).
- Imperative for tasks. Question headings for FAQ.
- Sentence case, short.

### Voice

- **You** = the reader.
- **TUROS** = the system (`TUROS returns…`, `TUROS prompts…`).
- **We** = recommendations and support only (`We recommend…`, `Contact us`).
- Contractions: don't, you'll, isn't, can't.
- Surfaces: "the TUROS dashboard", "side navigation", "account settings". Not "the app" or "the platform".

### Punctuation

- Oxford comma.
- Periods on list items that are full sentences; fragments may omit them.
- Spaced dash for asides (`members - a member represents…`).
- Acronyms expanded on first use: `Multi-Factor Authentication (MFA)`.

### Lists and tables

- Numbered lists for UI: one action per step, name the control, outcome sentence after the list.
- Bold-term-colon bullets for enumerations (`Operator: These users can…`).
- Tables for two-dimensional facts.

### Callouts

Sparse. Only for irreversibility, billing stops, or data loss. Blunt declaratives. Recommendations live in prose as "We recommend…" / "We strongly recommend…" / "You must…".

### Verbs (do not interchange)

| Verb | Use |
| --- | --- |
| submit | jobs, webhooks configuration payloads |
| send | requests to the API |
| run | checks that execute now |
| retrieve | pulling filings, artifacts, responses |
| review | reading things in the dashboard |
| check | verifying a fact |
| call | named endpoints |
| visit / learn more about | cross-links |
| Go to / Click / Toggle / Enter / Choose | UI steps |

### Volume

One page per topic, sized to the topic. Do not split for length. Do not pad.

## Text and code pages

### Titles

Sentence case, verb-led, channel suffix when siblings exist: `Retrieve filings - API`, `Retrieve filings - dashboard`.

### Anatomy

1. Capability intro (1–3 short paragraphs)
2. Redirect for the adjacent use case
3. Prerequisites
4. Testing (before production instructions)
5. Main task: endpoints → headers → body → sample request and response
6. Operational concerns (retries, timeouts, limits)
7. Deep-dive at the bottom

### Code

- Prose lead-in before every block.
- curl is the lingua franca. Response is a separate JSON block.
- Placeholders: `<api-key>`, `$SECAPI_API_KEY`.
- Realistic payloads. Mark truncation with `// truncated for brevity`.
- Required fields in a table before the sample.
- Rule → consequence → recommendation.

### API reference landing

Prose guide, not a spec index: authentication, key types, creating a key, passing the key, pagination, errors, limits, clients, idempotency, upgrades.

### API endpoint pages (when present)

H1 title case with method context: `Resolve Entity`. Dek is an imperative fragment. Then `GET /v1/entities/resolve`. Short intro, then Authorizations → Headers → Query/Body → response notes.

### Changelog entries

Present tense. Product-as-actor. "TUROS now…". "Previously, …" to contrast. Newest first.
