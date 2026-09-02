import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  DEFAULT_MAX_AGE_DAYS,
  MAX_FUTURE_SKEW_DAYS,
  evaluateCounterpartFreshness,
  fetchIsArchived,
  fetchLastCommitDate,
  isEntryPoint,
  lastCommitUrl,
  main,
  defaultFetch,
  repoUrl,
} from "./check_counterpart_freshness.mjs"

const NOW = "2026-09-02T12:00:00.000Z"
const source = "autonomous-computer/docs:openapi/sec-api-public.v1.json"

const daysBefore = (days) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString()

test("a counterpart updated within the budget passes", () => {
  const result = evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(3), now: NOW })
  assert.equal(result.ok, true)
  assert.match(result.message, /3\.0 days ago/)
})

test("a counterpart that has gone quiet past the budget FAILS", () => {
  const result = evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(120), now: NOW })
  assert.equal(result.ok, false)
  assert.match(result.message, new RegExp(`exceeds the ${DEFAULT_MAX_AGE_DAYS}-day budget`))
  // The message must say what to DO, not just that a number is large.
  assert.match(result.message, /repoint this guard at the authoritative source/)
})

test("the boundary is exclusive: exactly at the budget still passes, just past it fails", () => {
  assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(DEFAULT_MAX_AGE_DAYS), now: NOW }).ok, true)
  assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(DEFAULT_MAX_AGE_DAYS + 0.5), now: NOW }).ok, false)
})

// The whole point of the guard is that unevaluatable states are failures.
// If any of these passed, the guard could report success having checked nothing.
test("a missing timestamp FAILS rather than passing vacuously", () => {
  for (const value of [null, undefined, "", 0, {}]) {
    assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: value, now: NOW }).ok, false, `expected failure for ${JSON.stringify(value)}`)
  }
})

test("an unparseable timestamp FAILS", () => {
  const result = evaluateCounterpartFreshness({ source, lastCommittedAt: "not-a-date", now: NOW })
  assert.equal(result.ok, false)
  assert.match(result.message, /not a valid date/)
})

test("an unparseable current time FAILS", () => {
  assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(1), now: "nonsense" }).ok, false)
})

test("a non-positive or non-numeric budget FAILS instead of disabling the check", () => {
  for (const maxAgeDays of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(9999), now: NOW, maxAgeDays }).ok, false)
  }
})

test("ordinary clock skew (a commit dated slightly ahead) is fresh, not an error", () => {
  const result = evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(-MAX_FUTURE_SKEW_DAYS / 2), now: NOW })
  assert.equal(result.ok, true)
  assert.match(result.message, /treated as fresh/)
})

// Without an upper bound, ONE commit dated far ahead makes the counterpart look
// fresh indefinitely — a permanent no-op of the guard.
test("a far-future commit date FAILS rather than granting permanent freshness", () => {
  const result = evaluateCounterpartFreshness({ source, lastCommittedAt: "2099-01-01T00:00:00Z", now: NOW })
  assert.equal(result.ok, false)
  assert.match(result.message, /in the FUTURE/)
})

test("the future-skew tolerance is bounded on both sides", () => {
  assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(-(MAX_FUTURE_SKEW_DAYS - 0.01)), now: NOW }).ok, true)
  assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(-(MAX_FUTURE_SKEW_DAYS + 0.01)), now: NOW }).ok, false)
})

test("the budget is set from measured history, not left unbounded", () => {
  assert.equal(DEFAULT_MAX_AGE_DAYS, 30)
  assert.ok(MAX_FUTURE_SKEW_DAYS > 0 && MAX_FUTURE_SKEW_DAYS < 1)
})

test("the default budget is a real positive number", () => {
  assert.equal(typeof DEFAULT_MAX_AGE_DAYS, "number")
  assert.ok(DEFAULT_MAX_AGE_DAYS > 0)
})

test("fetchLastCommitDate reads the newest commit's date", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => [{ commit: { committer: { date: "2026-09-01T00:00:00Z" } } }] })
  assert.equal(await fetchLastCommitDate({ repo: "a/b", path: "p", fetchImpl }), "2026-09-01T00:00:00Z")
})

test("fetchLastCommitDate throws on a non-ok response rather than returning a fresh-looking value", async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({}) })
  await assert.rejects(() => fetchLastCommitDate({ repo: "a/b", path: "p", fetchImpl }), /404/)
})

test("fetchLastCommitDate throws when the path has no commits", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => [] })
  await assert.rejects(() => fetchLastCommitDate({ repo: "a/b", path: "p", fetchImpl }), /No commits found/)
})

// ---------------------------------------------------------------------------
// The `path=` filter. Without it the guard answers "is the repo alive at all",
// which is strictly weaker and is the failure mode being guarded: a retired repo
// still receives housekeeping commits.
// ---------------------------------------------------------------------------
test("the commits URL filters by path and asks for exactly one commit", () => {
  const url = lastCommitUrl({ repo: "autonomous-computer/docs", path: "openapi/sec-api-public.v1.json" })
  assert.match(url, /[?&]path=openapi%2Fsec-api-public\.v1\.json(&|$)/)
  assert.match(url, /[?&]per_page=1(&|$)/)
})

test("fetchLastCommitDate actually requests the path-filtered URL", async () => {
  let requested = null
  const fetchImpl = async (url) => {
    requested = url
    return { ok: true, json: async () => [{ commit: { committer: { date: "2026-09-01T00:00:00Z" } } }] }
  }
  await fetchLastCommitDate({ repo: "a/b", path: "dir/spec.json", fetchImpl })
  assert.match(requested, /path=dir%2Fspec\.json/)
})

test("committer.date takes precedence over author.date", async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [{ commit: { committer: { date: "2026-09-01T00:00:00Z" }, author: { date: "2020-01-01T00:00:00Z" } } }],
  })
  assert.equal(await fetchLastCommitDate({ repo: "a/b", path: "p", fetchImpl }), "2026-09-01T00:00:00Z")
})

// ---------------------------------------------------------------------------
// The CLI decision path. Previously untested: forcing exit 0, swallowing the
// catch, or disabling isMain each made the guard a permanent no-op with the
// whole suite still green.
// ---------------------------------------------------------------------------
const okRepoResponse = { ok: true, json: async () => ({ archived: false }) }
const commitsResponse = (date) => ({ ok: true, json: async () => [{ commit: { committer: { date } } }] })
// Records every requested URL. The previous double dispatched on the URL but
// never asserted it, so repo/path plumbing one call-frame up was unpinned:
// swapping in `path: "README.md"` — the degraded "is the repo alive at all"
// check this guard exists to prevent — survived with the suite green.
const routed = (handlers, seen = []) => {
  const impl = async (url) => {
    seen.push(url)
    return url.includes("/commits") ? handlers.commits : handlers.repo
  }
  impl.seen = seen
  return impl
}
const silent = () => {}

test("main returns 0 when the counterpart is fresh", async () => {
  const code = await main({
    env: {}, now: NOW, log: silent, logError: silent,
    fetchImpl: routed({ repo: okRepoResponse, commits: commitsResponse(daysBefore(2)) }),
  })
  assert.equal(code, 0)
})

test("main returns 1 when the counterpart has gone quiet", async () => {
  const code = await main({
    env: {}, now: NOW, log: silent, logError: silent,
    fetchImpl: routed({ repo: okRepoResponse, commits: commitsResponse(daysBefore(400)) }),
  })
  assert.equal(code, 1)
})

test("main returns 1 when the commits API errors — never 0", async () => {
  const code = await main({
    env: {}, now: NOW, log: silent, logError: silent,
    fetchImpl: routed({ repo: okRepoResponse, commits: { ok: false, status: 500, json: async () => ({}) } }),
  })
  assert.equal(code, 1)
})

test("main returns 1 when the counterpart repository is ARCHIVED, however fresh its last commit", async () => {
  let message = null
  const code = await main({
    env: {}, now: NOW, log: silent, logError: (m) => { message = m },
    fetchImpl: routed({ repo: { ok: true, json: async () => ({ archived: true }) }, commits: commitsResponse(daysBefore(0)) }),
  })
  assert.equal(code, 1)
  assert.match(message, /ARCHIVED/)
})

test("main returns 1 when the archived lookup itself fails", async () => {
  const code = await main({
    env: {}, now: NOW, log: silent, logError: silent,
    fetchImpl: routed({ repo: { ok: false, status: 404, json: async () => ({}) }, commits: commitsResponse(daysBefore(0)) }),
  })
  assert.equal(code, 1)
})

test("main rejects a bad budget before making any network call", async () => {
  let called = false
  const code = await main({
    env: { COUNTERPART_MAX_AGE_DAYS: "-1" }, now: NOW, log: silent, logError: silent,
    fetchImpl: async () => { called = true; return okRepoResponse },
  })
  assert.equal(code, 1)
  assert.equal(called, false, "must fail before touching the network")
})

test("fetchIsArchived reads the archived flag", async () => {
  assert.equal(await fetchIsArchived({ repo: "a/b", fetchImpl: async () => ({ ok: true, json: async () => ({ archived: true }) }) }), true)
  assert.equal(await fetchIsArchived({ repo: "a/b", fetchImpl: async () => ({ ok: true, json: async () => ({ archived: false }) }) }), false)
})

// ---------------------------------------------------------------------------
// The entrypoint guard. `file://${argv[1]}` mis-encodes spaces, and
// import.meta.url is realpath-resolved while argv[1] is not — either mismatch
// makes the whole CLI exit 0 with no output, indistinguishable from a pass.
// Runs through a SYMLINKED directory whose name contains a space to pin both.
// Uses the offline bad-budget path, so this test makes no network call.
// ---------------------------------------------------------------------------
test("the CLI body still runs when invoked via a symlinked path containing a space", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "freshness-"))
  const realDir = path.join(base, "real dir")
  mkdirSync(realDir)
  copyFileSync(new URL("./check_counterpart_freshness.mjs", import.meta.url), path.join(realDir, "check_counterpart_freshness.mjs"))
  const linkDir = path.join(base, "linked dir")
  symlinkSync(realDir, linkDir)
  try {
    let status = 0
    let stderr = ""
    try {
      execFileSync(process.execPath, [path.join(linkDir, "check_counterpart_freshness.mjs")], {
        env: { ...process.env, COUNTERPART_MAX_AGE_DAYS: "-1" },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
    } catch (error) {
      status = error.status
      stderr = error.stderr ?? ""
    }
    assert.equal(status, 1, "a silent exit 0 means the CLI body never executed")
    assert.match(stderr, /must be a positive number/)
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// main()'s PRODUCTION DEFAULTS. Previously every one was injected by every test,
// so the real clock, the real budget and the real repo/path were all unpinned —
// #48's structural gap, relocated one call-frame up.
// ---------------------------------------------------------------------------
// Date-INDEPENDENT kill for a frozen default clock. Asserting behaviour against
// real timestamps cannot work: a literal frozen to "today" behaves identically
// to the real clock today, and only diverges later — but a mutation test has to
// fail now. So assert the instant the decision was actually made.
test("main's DEFAULT clock is the real one, not a frozen literal", async () => {
  let logged = ""
  await main({ env: {}, log: (m) => { logged = m }, logError: (m) => { logged = m },
    fetchImpl: routed({ repo: okRepoResponse, commits: commitsResponse(new Date(Date.now() - 86_400_000).toISOString()) }) })
  const match = /\[evaluatedAt=([^\]]+)\]/.exec(logged)
  assert.ok(match, `no evaluatedAt in output: ${logged}`)
  const drift = Math.abs(Date.parse(match[1]) - Date.now())
  assert.ok(drift < 60_000, `main's default clock is ${(drift / 1000).toFixed(0)}s from real time — it is frozen`)
})

test("evaluateCounterpartFreshness reports the instant it evaluated", () => {
  assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(1), now: NOW }).evaluatedAt, new Date(NOW).toISOString())
})

test("main uses the REAL clock when `now` is not injected", async () => {
  const realRecent = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const realAncient = new Date(Date.now() - 400 * 86_400_000).toISOString()
  assert.equal(await main({ env: {}, log: silent, logError: silent, fetchImpl: routed({ repo: okRepoResponse, commits: commitsResponse(realRecent) }) }), 0)
  // A frozen default clock would keep returning 0 here forever.
  assert.equal(await main({ env: {}, log: silent, logError: silent, fetchImpl: routed({ repo: okRepoResponse, commits: commitsResponse(realAncient) }) }), 1)
})

test("main applies DEFAULT_MAX_AGE_DAYS when no budget is set", async () => {
  const inside = daysBefore(DEFAULT_MAX_AGE_DAYS - 1)
  const outside = daysBefore(DEFAULT_MAX_AGE_DAYS + 1)
  assert.equal(await main({ env: {}, now: NOW, log: silent, logError: silent, fetchImpl: routed({ repo: okRepoResponse, commits: commitsResponse(inside) }) }), 0)
  assert.equal(await main({ env: {}, now: NOW, log: silent, logError: silent, fetchImpl: routed({ repo: okRepoResponse, commits: commitsResponse(outside) }) }), 1)
})

// EXACT sequence, not `.some()`. Presence-only assertions pin that a correct URL
// was requested but not that no ADDITIONAL wrong one was, nor which response the
// decision used — so a second call to `path: "README.md"` overwriting the result
// (the degraded "is the repo alive at all" check this guard exists to prevent),
// or a silent retry with the filter dropped, both passed.
test("main makes EXACTLY the two expected requests, in order", async () => {
  const impl = routed({ repo: okRepoResponse, commits: commitsResponse(daysBefore(1)) })
  await main({ env: {}, now: NOW, log: silent, logError: silent, fetchImpl: impl })
  assert.deepEqual(impl.seen, [
    repoUrl({ repo: "autonomous-computer/docs" }),
    lastCommitUrl({ repo: "autonomous-computer/docs", path: "openapi/sec-api-public.v1.json" }),
  ])
})

test("main honours COUNTERPART_REPO and COUNTERPART_PATH", async () => {
  const impl = routed({ repo: okRepoResponse, commits: commitsResponse(daysBefore(1)) })
  await main({
    env: { COUNTERPART_REPO: "other/repo", COUNTERPART_PATH: "some/spec.json" },
    now: NOW, log: silent, logError: silent, fetchImpl: impl,
  })
  assert.deepEqual(impl.seen, [
    repoUrl({ repo: "other/repo" }),
    lastCommitUrl({ repo: "other/repo", path: "some/spec.json" }),
  ])
})

test("main checks archived BEFORE fetching commits", async () => {
  const impl = routed({ repo: okRepoResponse, commits: commitsResponse(daysBefore(1)) })
  await main({ env: {}, now: NOW, log: silent, logError: silent, fetchImpl: impl })
  assert.ok(impl.seen.length >= 2, "expected both requests")
  assert.ok(!impl.seen[0].includes("/commits"), `archived check must come first, got ${impl.seen[0]}`)
})

test("a commit carrying no date at all throws rather than defaulting to now", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => [{ commit: {} }] })
  await assert.rejects(() => fetchLastCommitDate({ repo: "a/b", path: "p", fetchImpl }), /carried no date/)
})

test("fetchIsArchived rejects a 200 whose body has no boolean `archived`", async () => {
  for (const body of [{}, { archived: "true" }, null, { archived: 1 }]) {
    await assert.rejects(
      () => fetchIsArchived({ repo: "a/b", fetchImpl: async () => ({ ok: true, json: async () => body }) }),
      /no boolean/,
      `expected rejection for ${JSON.stringify(body)}`,
    )
  }
})

// ---------------------------------------------------------------------------
// The skew constant, pinned to its exact value and its exact boundary — the
// budget already was, and an unpinned 0.999 would allow nearly a full day of
// committer-controlled future tolerance.
// ---------------------------------------------------------------------------
test("MAX_FUTURE_SKEW_DAYS is exactly six hours", () => {
  assert.equal(MAX_FUTURE_SKEW_DAYS, 0.25)
})

test("the skew boundary is exclusive, like the budget boundary", () => {
  const atBoundary = new Date(Date.parse(NOW) + MAX_FUTURE_SKEW_DAYS * 86_400_000).toISOString()
  assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: atBoundary, now: NOW }).ok, true)
  const pastBoundary = new Date(Date.parse(NOW) + (MAX_FUTURE_SKEW_DAYS * 86_400_000) + 60_000).toISOString()
  assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: pastBoundary, now: NOW }).ok, false)
})

// ---------------------------------------------------------------------------
// isEntryPoint. Extracted from module scope precisely so these cases exist.
// ---------------------------------------------------------------------------
test("isEntryPoint matches the plain path", () => {
  assert.equal(isEntryPoint({ importMetaUrl: "file:///a/b.mjs", entryPoint: "/a/b.mjs", realpath: (p) => p }), true)
})

test("isEntryPoint matches a path needing URL encoding", () => {
  assert.equal(isEntryPoint({ importMetaUrl: "file:///a/dir%20with%20space/b.mjs", entryPoint: "/a/dir with space/b.mjs", realpath: (p) => p }), true)
})

test("isEntryPoint matches via the realpath-resolved form", () => {
  assert.equal(isEntryPoint({ importMetaUrl: "file:///private/tmp/b.mjs", entryPoint: "/tmp/b.mjs", realpath: () => "/private/tmp/b.mjs" }), true)
})

// The first attempt used the literal form as a `catch` FALLBACK, which
// reintroduced the symlink trap whenever realpath threw. Here it is an
// additional accepted form, so a throwing realpath still matches the literal.
test("isEntryPoint still matches the literal form when realpath throws", () => {
  assert.equal(isEntryPoint({ importMetaUrl: "file:///a/b.mjs", entryPoint: "/a/b.mjs", realpath: () => { throw new Error("boom") } }), true)
})

test("isEntryPoint is false for a different file, and for a missing entrypoint", () => {
  assert.equal(isEntryPoint({ importMetaUrl: "file:///a/b.mjs", entryPoint: "/a/other.mjs", realpath: (p) => p }), false)
  assert.equal(isEntryPoint({ importMetaUrl: "file:///a/b.mjs", entryPoint: undefined }), false)
})

// N27: fetchImpl was the last unpinned production default. Every test injected
// one, and the spawn test returns before any fetch, so nothing asserted the CLI
// is network-bound at all — the same class the second pass blocked on.
test("main's DEFAULT fetch is the real global fetch", async () => {
  assert.equal(defaultFetch, globalThis.fetch)
})

// main() was never exercised on the future-skew path; only the pure function was.
test("main returns 1 for a far-future commit date", async () => {
  assert.equal(
    await main({ env: {}, now: NOW, log: silent, logError: silent,
      fetchImpl: routed({ repo: okRepoResponse, commits: commitsResponse("2099-01-01T00:00:00Z") }) }),
    1,
  )
})

// A valid budget was validated but never asserted to be APPLIED.
test("main applies a valid COUNTERPART_MAX_AGE_DAYS override", async () => {
  const impl = () => routed({ repo: okRepoResponse, commits: commitsResponse(daysBefore(10)) })
  assert.equal(await main({ env: { COUNTERPART_MAX_AGE_DAYS: "5" }, now: NOW, log: silent, logError: silent, fetchImpl: impl() }), 1)
  assert.equal(await main({ env: { COUNTERPART_MAX_AGE_DAYS: "20" }, now: NOW, log: silent, logError: silent, fetchImpl: impl() }), 0)
})
