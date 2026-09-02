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

/** Default budget. Generous on purpose: the producer is dispatched by hand, so
 *  a quiet fortnight is normal and must not cry wolf. A quiet season is not. */
export const DEFAULT_MAX_AGE_DAYS = 45

const MS_PER_DAY = 86_400_000

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

  const ageDays = (current.getTime() - committed.getTime()) / MS_PER_DAY
  // Clock skew / a commit dated slightly ahead is fresh, not an error.
  if (ageDays < 0) {
    return { ok: true, message: `${source}: last updated ${committed.toISOString()} (dated ahead of now; treated as fresh).` }
  }
  if (ageDays > maxAgeDays) {
    return {
      ok: false,
      message:
        `${source}: last updated ${committed.toISOString()}, ${ageDays.toFixed(1)} days ago, which exceeds the ${maxAgeDays}-day budget.\n` +
        `The spec this repo reconciles against has gone quiet, so cross-repo parity is being checked against a document that no longer moves — it cannot fail, whatever this repo changes.\n` +
        `Find out whether its producer (omni-datastream's sync-docs-to-mintlify) still runs, and repoint this guard at the authoritative source.`,
    }
  }
  return { ok: true, message: `${source}: last updated ${committed.toISOString()}, ${ageDays.toFixed(1)} days ago (within the ${maxAgeDays}-day budget).` }
}

/** Resolves the commit date of the newest commit touching `path` in `repo`. */
export async function fetchLastCommitDate({ repo, path, fetchImpl = fetch, token }) {
  const url = `https://api.github.com/repos/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetchImpl(url, { headers })
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} for ${repo}:${path}`)
  }
  const commits = await response.json()
  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error(`No commits found for ${repo}:${path}`)
  }
  const date = commits[0]?.commit?.committer?.date ?? commits[0]?.commit?.author?.date
  if (!date) throw new Error(`Commit for ${repo}:${path} carried no date`)
  return date
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const repo = process.env.COUNTERPART_REPO ?? "autonomous-computer/docs"
  const path = process.env.COUNTERPART_PATH ?? "openapi/sec-api-public.v1.json"
  const maxAgeDays = Number(process.env.COUNTERPART_MAX_AGE_DAYS ?? DEFAULT_MAX_AGE_DAYS)
  const source = `${repo}:${path}`
  let lastCommittedAt = null
  try {
    lastCommittedAt = await fetchLastCommitDate({ repo, path, token: process.env.GITHUB_TOKEN })
  } catch (error) {
    // A fetch failure is a failure. Resolving nothing is the same observable
    // state as a frozen counterpart, and must not be reported as fresh.
    console.error(`${source}: could not resolve last-commit date: ${error.message}`)
    process.exit(1)
  }
  const result = evaluateCounterpartFreshness({ source, lastCommittedAt, now: new Date().toISOString(), maxAgeDays })
  console.log(result.message)
  process.exit(result.ok ? 0 : 1)
}
