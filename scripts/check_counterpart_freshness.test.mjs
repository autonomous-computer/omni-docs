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
  lastCommitUrl,
  main,
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
const routed = (handlers) => async (url) => (url.includes("/commits") ? handlers.commits : handlers.repo)
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
