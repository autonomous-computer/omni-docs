#!/usr/bin/env node

/**
 * Fails when the spec this repo reconciles against has stopped being updated.
 *
 * WHY THIS EXISTS. `cross-repo-parity` in .github/workflows/docs-guards.yml
 * compares this repo's `openapi/sec-api-public.v1.json` against a counterpart
 * copy fetched over the network. That comparison is only meaningful while the
 * counterpart is still being fed. If its producer stops, the fetch keeps
 * returning 200 with a well-formed, path-rich document, every existing
 * assertion keeps passing, and the guard reports parity against a fossil — it
 * cannot fail, whatever this repo does to its own spec.
 *
 * That is not hypothetical. The counterpart lives in `autonomous-computer/docs`
 * (docs.secapi.ai), which was retired as a source of truth on 2026-09-02 when
 * the docs moved to www.turos.app/docs served from THIS repo. It is fed by
 * omni-datastream's `sync-docs-to-mintlify` workflow, which is manual
 * (`workflow_dispatch`). The day that workflow is repointed or simply stops
 * being dispatched, this repo's only defence against spec drift goes quiet
 * without a single red check — reopening exactly the hole that let the
 * 2026-09-01 internal-vocabulary purge reach docs.secapi.ai and not here.
 *
 * So: assert the counterpart is still MOVING, not merely present. An age check
 * cannot prove the content is correct, and does not try to. It proves the
 * comparison still has a live counterparty, which is the premise every other
 * assertion in that job silently depends on.
 *
 * A failure here is not necessarily a docs bug. It means "the thing we
 * reconcile against went quiet — find out whether its producer still runs, and
 * repoint this at the authoritative source." That is the message it prints.
 *
 * Network-free core: `evaluateCounterpartFreshness` is pure and unit-tested;
 * only the CLI wrapper talks to the GitHub API.
 */

import { pathToFileURL } from "node:url"
import { realpathSync } from "node:fs"

/**
 * Default budget, set from the counterpart's measured history rather than a
 * round number. Over n=91 commits to `openapi/sec-api-public.v1.json` in
 * `autonomous-computer/docs` (2026-05-22 → 2026-09-02) the largest gap between
 * consecutive commits was **17.18 days**, then 15.79, 12.89, 9.75, 8.74.
 *
 * 30 days is ~1.75x the worst gap ever observed — enough headroom that a
 * hand-dispatched producer will not cry wolf, while keeping the blind window
 * near a month instead of the six weeks a 45-day budget bought. The earlier
 * 45-day value was chosen before this history was measured and claimed "a quiet
 * fortnight is normal"; a fortnight is in fact already the 2nd-worst gap on
 * record, so that reasoning was wrong.
 */
export const DEFAULT_MAX_AGE_DAYS = 30

const MS_PER_DAY = 86_400_000

/** Ordinary clock skew, in days. Six hours. Anything beyond is a broken signal. */
export const MAX_FUTURE_SKEW_DAYS = 0.25

/**
 * Pure decision. Returns { ok, message }.
 *
 * Anything it cannot evaluate is a FAILURE, never a pass: a missing or
 * unparseable timestamp is precisely the state a silent-freeze would present,
 * so it must never be waved through.
 */
export function evaluateCounterpartFreshness({ source, lastCommittedAt, now, maxAgeDays = DEFAULT_MAX_AGE_DAYS }) {
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    return { ok: false, message: `maxAgeDays must be a positive number, got ${maxAgeDays}` }
  }
  if (typeof lastCommittedAt !== "string" || lastCommittedAt.length === 0) {
    return { ok: false, message: `${source}: no last-commit timestamp was resolved, so freshness could not be established.` }
  }
  const committed = new Date(lastCommittedAt)
  if (Number.isNaN(committed.getTime())) {
    return { ok: false, message: `${source}: last-commit timestamp "${lastCommittedAt}" is not a valid date.` }
  }
  const current = new Date(now)
  if (Number.isNaN(current.getTime())) {
    return { ok: false, message: `${source}: current time "${now}" is not a valid date.` }
  }

  // Surfaced so the caller's DEFAULT clock is observable. Without this, freezing
  // main()'s default `now` to a literal is undetectable by any test that does not
  // inject one — and a frozen clock keeps the guard green in perpetuity.
  const evaluatedAt = current.toISOString()
  const ageDays = (current.getTime() - committed.getTime()) / MS_PER_DAY
  // A commit dated slightly ahead is ordinary clock skew and is fresh. An
  // UNBOUNDED future tolerance is not: `commit.committer.date` is
  // committer-controlled (GIT_COMMITTER_DATE), and rebases and imports routinely
  // produce skewed dates. One commit dated 2099 would otherwise make the
  // counterpart "fresh" forever — a permanent no-op of exactly the kind this
  // file exists to prevent. So skew is tolerated only up to a few hours.
  if (ageDays < 0) {
    if (-ageDays > MAX_FUTURE_SKEW_DAYS) {
      return {
        ok: false,
        message:
          `${source}: last-commit date ${committed.toISOString()} is ${(-ageDays).toFixed(1)} days in the FUTURE, beyond the ${MAX_FUTURE_SKEW_DAYS}-day skew tolerance.\n` +
          `A commit dated far ahead would make this counterpart look fresh indefinitely, so it is treated as a broken signal rather than a pass.`,
      }
    }
    return { ok: true, evaluatedAt, message: `${source}: last updated ${committed.toISOString()} (dated slightly ahead of now; treated as fresh). [evaluatedAt=${evaluatedAt}]` }
  }
  if (ageDays > maxAgeDays) {
    return {
      ok: false,
      message:
        `${source}: last updated ${committed.toISOString()}, ${ageDays.toFixed(1)} days ago, which exceeds the ${maxAgeDays}-day budget.\n` +
        `The spec this repo reconciles against has gone quiet, so cross-repo parity is being checked against a document that no longer moves — it cannot fail, whatever this repo changes.\n` +
        `Find out whether its producer (omni-datastream's sync-docs-to-mintlify) still runs, and repoint this guard at the authoritative source. [evaluatedAt=${evaluatedAt}]`,
      evaluatedAt,
    }
  }
  return { ok: true, evaluatedAt, message: `${source}: last updated ${committed.toISOString()}, ${ageDays.toFixed(1)} days ago (within the ${maxAgeDays}-day budget). [evaluatedAt=${evaluatedAt}]` }
}

/**
 * Resolves the commit date of the newest commit touching `path` in `repo`.
 *
 * The `path=` filter is load-bearing and asserted by tests: without it this
 * would answer "is the repo alive at all", which is strictly weaker and is the
 * very failure mode being guarded — a retired repo still receives housekeeping
 * commits.
 *
 * Known limit, stated rather than implied: "a commit touched the path" includes
 * a whitespace change, a revert, or a bot header sweep. Liveness is not proof of
 * feeding. This narrows the blind spot; it does not close it.
 */
export function lastCommitUrl({ repo, path }) {
  return `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`
}

export async function fetchLastCommitDate({ repo, path, fetchImpl = fetch, token }) {
  const response = await fetchImpl(lastCommitUrl({ repo, path }), { headers: githubHeaders(token) })
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${repo}:${path}`)
  }
  const commits = await response.json()
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error(`No commits found for ${repo}:${path}`)
  }
  // committer.date first: it is the date the commit landed. author.date lags
  // arbitrarily through rebases and cherry-picks, so it would overstate age.
  const date = commits[0]?.commit?.committer?.date ?? commits[0]?.commit?.author?.date
  if (!date) throw new Error(`Commit for ${repo}:${path} carried no date`)
  return date
}

function githubHeaders(token) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/**
 * An archived counterpart can never be fed again, whatever its last commit date
 * says. Archiving `autonomous-computer/docs` is the obvious next step after its
 * retirement, and the commits API serves archived repos normally — so without
 * this the guard would stay green for a full budget after the repo was frozen
 * by definition.
 */
export function repoUrl({ repo }) {
  return `https://api.github.com/repos/${repo}`
}

export async function fetchIsArchived({ repo, fetchImpl = fetch, token }) {
  const response = await fetchImpl(repoUrl({ repo }), { headers: githubHeaders(token) })
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${repo}`)
  const body = await response.json()
  // A 200 whose body lacks `archived` — wrong endpoint, schema change, an
  // intercepting proxy — must not read as "not archived". Require the field.
  if (typeof body?.archived !== "boolean") {
    throw new Error(`GitHub API response for ${repo} has no boolean \`archived\` field`)
  }
  return body.archived
}

/**
 * The whole CLI decision, returning an exit code instead of calling
 * process.exit, so it is unit-testable with an injected fetch. The previous
 * version put this logic directly in the `isMain` block, where three separate
 * mutations — forcing exit 0, swallowing the catch, and disabling isMain — each
 * turned the guard into a permanent no-op with the whole suite still green.
 */
/** Exported so the CLI default is pinnable; every test injects its own. */
export const defaultFetch = fetch

export async function main({ env = process.env, fetchImpl = defaultFetch, now = new Date().toISOString(), log = console.log, logError = console.error } = {}) {
  const repo = env.COUNTERPART_REPO ?? "autonomous-computer/docs"
  const path = env.COUNTERPART_PATH ?? "openapi/sec-api-public.v1.json"
  const maxAgeDays = Number(env.COUNTERPART_MAX_AGE_DAYS ?? DEFAULT_MAX_AGE_DAYS)
  const source = `${repo}:${path}`

  // Validated BEFORE any network call, so a misconfigured budget fails fast and
  // offline — and so the CLI has a network-free path its spawn test can use.
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    logError(`${source}: COUNTERPART_MAX_AGE_DAYS must be a positive number, got "${env.COUNTERPART_MAX_AGE_DAYS}".`)
    return 1
  }

  const token = env.GITHUB_TOKEN
  try {
    if (await fetchIsArchived({ repo, fetchImpl, token })) {
      logError(`${source}: the counterpart repository is ARCHIVED, so it can never be fed again. Repoint this guard at the authoritative source.`)
      return 1
    }
  } catch (error) {
    logError(`${source}: could not determine whether the counterpart is archived: ${error.message}`)
    return 1
  }

  let lastCommittedAt = null
  try {
    lastCommittedAt = await fetchLastCommitDate({ repo, path, fetchImpl, token })
  } catch (error) {
    // Resolving nothing is the same observable state as a frozen counterpart.
    logError(`${source}: could not resolve last-commit date: ${error.message}`)
    return 1
  }

  const result = evaluateCounterpartFreshness({ source, lastCommittedAt, now, maxAgeDays })
  log(result.message)
  return result.ok ? 0 : 1
}

// `file://${process.argv[1]}` breaks on any path needing URL encoding — a space,
// `#`, or non-ASCII — and the CLI body then silently never runs: exit 0, no
// output. That is the exact failure this file exists to prevent, so it is pinned
// by a spawn test that runs the script from a directory whose name has a space.
/**
 * Whether this module is being run as a script. Extracted and unit-tested
 * because three separate traps here each silently no-op the ENTIRE CLI —
 * exit 0, no output, indistinguishable from a pass:
 *   1. `file://${argv[1]}` mis-encodes any path with a space, `#`, or non-ASCII.
 *   2. `import.meta.url` is REALPATH-resolved but argv[1] is not, so a symlinked
 *      path never matches (on macOS /tmp -> /private/tmp).
 *   3. argv[1] is undefined under `node -e` and some embedders.
 *
 * Matches EITHER the realpath-resolved or the literal form. Matching either is
 * strictly safer than matching one: the failure mode defended against is a
 * false NEGATIVE (isMain wrongly false, guard never runs), so widening what
 * counts as a match can only reduce it. An earlier revision used the literal
 * form as a `catch` FALLBACK, which reintroduced trap 2 whenever realpath threw;
 * here it is an additional accepted form, not a replacement one.
 */
export function isEntryPoint({ importMetaUrl, entryPoint, realpath = realpathSync }) {
  if (!entryPoint) return false
  const candidates = [entryPoint]
  try {
    candidates.push(realpath(entryPoint))
  } catch {
    // Canonicalization failing is not itself a reason to skip the CLI.
  }
  return candidates.some((candidate) => {
    try {
      return importMetaUrl === pathToFileURL(candidate).href
    } catch {
      return false
    }
  })
}

if (isEntryPoint({ importMetaUrl: import.meta.url, entryPoint: process.argv[1] })) {
  process.exit(await main())
}
