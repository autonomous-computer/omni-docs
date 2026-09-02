import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_CONTRACT_URL,
  DEFAULT_MANIFEST_URL,
  DEFAULT_MAX_MANIFEST_AGE_DAYS,
  MIN_OPERATIONS,
  defaultFetch,
  evaluateSync,
  main,
  operationCountOf,
  prunedBaseline,
  sha256Of,
} from "./sync_public_contract.mjs"

const NOW = "2026-09-02T12:00:00.000Z"
const specWith = (n) => {
  const paths = {}
  for (let i = 0; i < n; i += 1) paths[`/v1/thing-${i}`] = { get: {} }
  return JSON.stringify({ openapi: "3.1.0", paths })
}
const GOOD = specWith(MIN_OPERATIONS + 10)
const manifestFor = (body, overrides = {}) =>
  JSON.stringify({ sourceCommit: "abcdef1234", publishedAt: NOW, sha256: sha256Of(body), operationCount: operationCountOf(body), object: "sec-api-public.v1.json", ...overrides })
const ev = (args) => evaluateSync({ contractBody: GOOD, manifestBody: manifestFor(GOOD), localBody: null, now: NOW, ...args })

test("counts operations, not paths", () => {
  assert.equal(operationCountOf(JSON.stringify({ paths: { "/a": { get: {}, post: {} } } })), 2)
})

test("updates when the local copy differs", () => {
  const r = ev({})
  assert.equal(r.ok, true)
  assert.equal(r.action, "update")
})

test("is a no-op when the local copy already matches", () => {
  const r = ev({ localBody: GOOD })
  assert.equal(r.action, "up-to-date")
})

// The source being unusable must never read as "nothing to do".
test("FAILS when the manifest does not describe the served contract", () => {
  const r = ev({ manifestBody: manifestFor(specWith(MIN_OPERATIONS + 9)) })
  assert.equal(r.ok, false)
  assert.match(r.reasons[0], /partial or stale publish/)
})

test("FAILS on a stale manifest, however valid the contract", () => {
  const r = ev({ manifestBody: manifestFor(GOOD, { publishedAt: "2020-01-01T00:00:00.000Z" }) })
  assert.equal(r.ok, false)
  assert.match(r.reasons[0], /beyond the 30-day budget/)
})

test("a stale manifest fails even when the local copy already matches", () => {
  const r = ev({ localBody: GOOD, manifestBody: manifestFor(GOOD, { publishedAt: "2020-01-01T00:00:00.000Z" }) })
  assert.equal(r.ok, false)
})

test("FAILS on a truncated published contract", () => {
  const body = specWith(3)
  assert.equal(ev({ contractBody: body, manifestBody: manifestFor(body) }).ok, false)
})

test("FAILS on an unparseable or incomplete manifest", () => {
  assert.equal(ev({ manifestBody: "{not json" }).ok, false)
  for (const field of ["sha256", "sourceCommit", "publishedAt", "operationCount"]) {
    const m = JSON.parse(manifestFor(GOOD))
    delete m[field]
    assert.equal(ev({ manifestBody: JSON.stringify(m) }).ok, false, `missing ${field} must fail`)
  }
})

test("FAILS on an invalid date or a non-positive budget", () => {
  assert.equal(ev({ manifestBody: manifestFor(GOOD, { publishedAt: "nope" }) }).ok, false)
  assert.equal(ev({ maxAgeDays: 0 }).ok, false)
  assert.equal(ev({ maxAgeDays: Number.NaN }).ok, false)
})

test("the staleness budget is exactly 30 days and the boundary is exclusive", () => {
  assert.equal(DEFAULT_MAX_MANIFEST_AGE_DAYS, 30)
  const at = new Date(Date.parse(NOW) - 30 * 86_400_000).toISOString()
  const past = new Date(Date.parse(NOW) - 30.5 * 86_400_000).toISOString()
  assert.equal(ev({ manifestBody: manifestFor(GOOD, { publishedAt: at }) }).ok, true)
  assert.equal(ev({ manifestBody: manifestFor(GOOD, { publishedAt: past }) }).ok, false)
})

// ---- decision layer ----
const routed = (bodies, seen = []) => {
  const impl = async (url) => {
    seen.push(url)
    const body = url.endsWith(".meta.json") ? bodies.manifest : bodies.contract
    if (body === null) return { ok: false, status: 404, text: async () => "" }
    return { ok: true, status: 200, text: async () => body }
  }
  impl.seen = seen
  return impl
}
const silent = () => {}
const run = (args = {}) =>
  main({ env: args.env ?? {}, now: NOW, log: silent, logError: silent,
    fetchImpl: args.fetchImpl ?? routed({ contract: GOOD, manifest: manifestFor(GOOD) }),
    readLocal: () => args.local ?? null,
    writeLocal: args.writeLocal ?? (() => {}) })

test("main returns 2 and writes the file when the contract changed", async () => {
  let written = null
  assert.equal(await run({ writeLocal: (_p, b) => { written = b } }), 2)
  assert.equal(written, GOOD)
})

test("main returns 0 and writes nothing when already current", async () => {
  let wrote = false
  assert.equal(await run({ local: GOOD, writeLocal: () => { wrote = true } }), 0)
  assert.equal(wrote, false)
})

// A missing artifact must break the sync, not read as "no update".
test("main returns 1 when the published contract is MISSING", async () => {
  assert.equal(await run({ fetchImpl: routed({ contract: null, manifest: manifestFor(GOOD) }) }), 1)
})

test("main returns 1 when the manifest is MISSING", async () => {
  assert.equal(await run({ fetchImpl: routed({ contract: GOOD, manifest: null }) }), 1)
})

test("main returns 1 and writes nothing on a stale publish", async () => {
  let wrote = false
  const code = await run({
    fetchImpl: routed({ contract: GOOD, manifest: manifestFor(GOOD, { publishedAt: "2020-01-01T00:00:00.000Z" }) }),
    writeLocal: () => { wrote = true },
  })
  assert.equal(code, 1)
  assert.equal(wrote, false)
})

test("main reads BOTH published objects from the documented URLs", async () => {
  const impl = routed({ contract: GOOD, manifest: manifestFor(GOOD) })
  await run({ fetchImpl: impl })
  assert.deepEqual(impl.seen, [DEFAULT_CONTRACT_URL, DEFAULT_MANIFEST_URL])
})

test("main honours URL and target overrides", async () => {
  const impl = routed({ contract: GOOD, manifest: manifestFor(GOOD) })
  let path = null
  await main({ env: { PUBLIC_CONTRACT_URL: "https://x.test/c.json", PUBLIC_CONTRACT_MANIFEST_URL: "https://x.test/c.meta.json", PUBLIC_CONTRACT_TARGET: "other.json" },
    now: NOW, log: silent, logError: silent, fetchImpl: impl, readLocal: () => null, writeLocal: (p) => { path = p } })
  assert.deepEqual(impl.seen, ["https://x.test/c.json", "https://x.test/c.meta.json"])
  assert.equal(path, "other.json")
})

test("main's DEFAULT fetch is the real global fetch", () => {
  assert.equal(defaultFetch, globalThis.fetch)
})

test("main's DEFAULT clock is real, not frozen", async () => {
  // A manifest published 29 days before REAL now is inside the budget; a clock
  // frozen to any literal drifts and flips this.
  const fresh = new Date(Date.now() - 29 * 86_400_000).toISOString()
  const stale = new Date(Date.now() - 31 * 86_400_000).toISOString()
  const mk = (at) => routed({ contract: GOOD, manifest: manifestFor(GOOD, { publishedAt: at }) })
  assert.equal(await main({ env: {}, log: silent, logError: silent, fetchImpl: mk(fresh), readLocal: () => null, writeLocal: () => {} }), 2)
  assert.equal(await main({ env: {}, log: silent, logError: silent, fetchImpl: mk(stale), readLocal: () => null, writeLocal: () => {} }), 1)
})

test("CHECK-ONLY returns 0 for a usable source whether or not the local copy drifted, and never writes", async () => {
  let wrote = false
  const w = () => { wrote = true }
  assert.equal(await run({ env: { PUBLIC_CONTRACT_CHECK_ONLY: "true" }, writeLocal: w }), 0)
  assert.equal(await run({ env: { PUBLIC_CONTRACT_CHECK_ONLY: "true" }, local: GOOD, writeLocal: w }), 0)
  assert.equal(wrote, false)
})

test("CHECK-ONLY still FAILS on a stale or missing source", async () => {
  assert.equal(await run({ env: { PUBLIC_CONTRACT_CHECK_ONLY: "true" },
    fetchImpl: routed({ contract: GOOD, manifest: manifestFor(GOOD, { publishedAt: "2020-01-01T00:00:00.000Z" }) }) }), 1)
  assert.equal(await run({ env: { PUBLIC_CONTRACT_CHECK_ONLY: "true" }, fetchImpl: routed({ contract: null, manifest: manifestFor(GOOD) }) }), 1)
})

test("prunedBaseline empties divergences and says why", () => {
  const out = prunedBaseline({ divergences: { "GET /a|description": { digest: "x" } }, other: 1 })
  assert.deepEqual(out.divergences, {})
  assert.equal(out.other, 1)
  assert.match(out._comment.join(" "), /byte-identical/)
})

test("a sync prunes the now-stale baseline, because the specs become identical", async () => {
  const writes = new Map()
  const baseline = JSON.stringify({ divergences: { "GET /a|description": { digest: "x" }, "GET /b|summary": { digest: "y" } } })
  const code = await main({
    env: {}, now: NOW, log: silent, logError: silent,
    fetchImpl: routed({ contract: GOOD, manifest: manifestFor(GOOD) }),
    readLocal: (p) => (p.endsWith("baseline.json") ? baseline : null),
    writeLocal: (p, b) => writes.set(p, b),
  })
  assert.equal(code, 2)
  assert.deepEqual(JSON.parse(writes.get("scripts/cross_repo_text_parity_baseline.json")).divergences, {})
})

test("an up-to-date run touches neither the contract nor the baseline", async () => {
  const writes = new Map()
  const code = await main({
    env: {}, now: NOW, log: silent, logError: silent,
    fetchImpl: routed({ contract: GOOD, manifest: manifestFor(GOOD) }),
    readLocal: (p) => (p.endsWith("baseline.json") ? JSON.stringify({ divergences: { "GET /a|d": {} } }) : GOOD),
    writeLocal: (p, b) => writes.set(p, b),
  })
  assert.equal(code, 0)
  assert.equal(writes.size, 0)
})

test("a corrupt baseline is a failure, not a silently skipped prune", async () => {
  const code = await main({
    env: {}, now: NOW, log: silent, logError: silent,
    fetchImpl: routed({ contract: GOOD, manifest: manifestFor(GOOD) }),
    readLocal: (p) => (p.endsWith("baseline.json") ? "{not json" : null),
    writeLocal: () => {},
  })
  assert.equal(code, 1)
})
