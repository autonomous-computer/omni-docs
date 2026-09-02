import test from "node:test"
import assert from "node:assert/strict"
import {
  DEFAULT_MAX_AGE_DAYS,
  evaluateCounterpartFreshness,
  fetchLastCommitDate,
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
  assert.match(result.message, /exceeds the 45-day budget/)
  // The message must say what to DO, not just that a number is large.
  assert.match(result.message, /repoint this guard at the authoritative source/)
})

test("the boundary is exclusive: exactly at the budget still passes, just past it fails", () => {
  assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(45), now: NOW }).ok, true)
  assert.equal(evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(45.5), now: NOW }).ok, false)
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

test("a commit dated slightly ahead of now is treated as fresh, not an error", () => {
  const result = evaluateCounterpartFreshness({ source, lastCommittedAt: daysBefore(-0.5), now: NOW })
  assert.equal(result.ok, true)
  assert.match(result.message, /treated as fresh/)
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
