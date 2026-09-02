#!/usr/bin/env node
/**
 * Pulls the authoritative public OpenAPI contract from its published URL and
 * reports whether this repo's copy needs updating.
 *
 * WHY PULL. omni-datastream is private, so this repo cannot read the
 * authoritative spec directly. It used to reconcile against
 * `autonomous-computer/docs` — retired as a source of truth on 2026-09-02 — and
 * would have kept doing so silently after that repo stopped being fed. The
 * publisher (omni-datastream `scripts/ops/publish_public_contract.ts`) now
 * writes the contract and a provenance manifest to a stable public URL, so this
 * repo and that repo's drift guard read the SAME artifact by construction.
 *
 * Pull, not push: a push-based sync would need write access to this repo and
 * would leave the parity guard pointed at a different artifact than the one
 * being published — the exact shape of the bug this replaces.
 *
 * WHAT IT REFUSES. A missing artifact, a manifest that does not describe the
 * contract served alongside it, and a manifest older than the staleness budget
 * are all FAILURES, not "no update needed". A sync that treats an absent or
 * fossilised source as "nothing to do" is the same green-by-absence defect one
 * layer down, and this file exists because of that defect.
 */
export const DEFAULT_CONTRACT_URL = "https://pub-8ccf92e01eab45579c477ec003519925.r2.dev/sec-api-public.v1.json"
export const DEFAULT_MANIFEST_URL = "https://pub-8ccf92e01eab45579c477ec003519925.r2.dev/sec-api-public.v1.meta.json"
/** Matches the publisher's own floor: below this, the document is truncated. */
export const MIN_OPERATIONS = 200
/** The publisher runs on every docs deploy, so a month of silence is a problem. */
export const DEFAULT_MAX_MANIFEST_AGE_DAYS = 30
export const DEFAULT_BASELINE_PATH = "scripts/cross_repo_text_parity_baseline.json"

/**
 * The text-parity baseline records divergences between this repo's spec and the
 * counterpart's. It is a RATCHET: an entry that no longer diverges also fails,
 * so it cannot rot into a silent skip.
 *
 * A wholesale sync makes the two documents byte-identical, so NO divergence can
 * exist and every entry becomes stale at once — 60 of them, on the first sync.
 * Writing the contract without pruning the baseline would therefore land a PR
 * that breaks `cross-repo-parity` on arrival. Pruning here is not a workaround:
 * the debt really is paid, which is exactly what the ratchet demands.
 */
export function prunedBaseline(baseline) {
  return {
    ...baseline,
    _comment: [
      "Text divergences between openapi/sec-api-public.v1.json in THIS repo and the",
      "authoritative contract published by omni-datastream.",
      "",
      "Empty by construction: that contract is now pulled wholesale by",
      "scripts/sync_public_contract.mjs, so the two documents are byte-identical and",
      "no divergence can exist. An entry appearing here again means someone edited",
      "this repo's copy by hand instead of changing the source.",
    ],
    divergences: {},
  }
}

import { createHash } from "node:crypto"

export const sha256Of = (body) => createHash("sha256").update(body).digest("hex")

export function operationCountOf(body) {
  const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options"])
  const paths = JSON.parse(body)?.paths ?? {}
  let count = 0
  for (const operations of Object.values(paths)) {
    for (const method of Object.keys(operations ?? {})) if (methods.has(method.toLowerCase())) count += 1
  }
  return count
}

/**
 * The whole decision, pure. Returns { ok, action, reasons }.
 * `ok:false` means the SOURCE is unusable — never "no update needed".
 */
export function evaluateSync({ contractBody, manifestBody, localBody, now, maxAgeDays = DEFAULT_MAX_MANIFEST_AGE_DAYS, minOperations = MIN_OPERATIONS }) {
  const reasons = []
  let manifest
  try {
    manifest = JSON.parse(manifestBody)
  } catch {
    return { ok: false, action: "fail", reasons: ["published manifest is not valid JSON"] }
  }
  for (const field of ["sha256", "sourceCommit", "publishedAt", "operationCount"]) {
    if (manifest?.[field] === undefined) return { ok: false, action: "fail", reasons: [`published manifest is missing \`${field}\``] }
  }

  // The manifest must describe the contract served beside it. A mismatch means a
  // partial publish: one object updated, the other not. Trusting either alone
  // would let a fossil through.
  const contractSha = sha256Of(contractBody)
  if (contractSha !== manifest.sha256) {
    return { ok: false, action: "fail", reasons: [`published manifest sha256 ${manifest.sha256} does not describe the served contract (${contractSha}) — partial or stale publish`] }
  }

  let operationCount
  try {
    operationCount = operationCountOf(contractBody)
  } catch {
    return { ok: false, action: "fail", reasons: ["published contract is not valid JSON"] }
  }
  if (operationCount < minOperations) {
    return { ok: false, action: "fail", reasons: [`published contract exposes only ${operationCount} operations, below the floor of ${minOperations}`] }
  }

  const publishedAt = new Date(manifest.publishedAt)
  const current = new Date(now)
  if (Number.isNaN(publishedAt.getTime()) || Number.isNaN(current.getTime())) {
    return { ok: false, action: "fail", reasons: [`published manifest publishedAt "${manifest.publishedAt}" is not a valid date`] }
  }
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    return { ok: false, action: "fail", reasons: [`maxAgeDays must be a positive number, got ${maxAgeDays}`] }
  }
  const ageDays = (current.getTime() - publishedAt.getTime()) / 86_400_000
  if (ageDays > maxAgeDays) {
    return { ok: false, action: "fail", reasons: [`published contract was last published ${ageDays.toFixed(1)} days ago, beyond the ${maxAgeDays}-day budget — its producer has gone quiet, so this sync would be reconciling against a fossil`] }
  }

  if (localBody !== null && sha256Of(localBody) === contractSha) {
    return { ok: true, action: "up-to-date", reasons: [`local copy already matches published sha256 ${contractSha.slice(0, 16)}…`] }
  }
  reasons.push(`published contract (${operationCount} operations, source ${String(manifest.sourceCommit).slice(0, 9)}) differs from the local copy`)
  return { ok: true, action: "update", reasons, contractBody, manifest }
}

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { realpathSync } from "node:fs"

export const defaultFetch = fetch

async function fetchText(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { "Cache-Control": "no-cache" } })
  if (!response.ok) throw new Error(`${url} returned ${response.status}`)
  return await response.text()
}

/** Exit code, not process.exit, so every branch is unit-testable. */
export async function main({
  env = process.env,
  fetchImpl = defaultFetch,
  now = new Date().toISOString(),
  readLocal = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null),
  writeLocal = (p, body) => writeFileSync(p, body),
  log = console.log,
  logError = console.error,
} = {}) {
  const contractUrl = env.PUBLIC_CONTRACT_URL ?? DEFAULT_CONTRACT_URL
  const manifestUrl = env.PUBLIC_CONTRACT_MANIFEST_URL ?? DEFAULT_MANIFEST_URL
  const target = env.PUBLIC_CONTRACT_TARGET ?? "openapi/sec-api-public.v1.json"
  const maxAgeDays = Number(env.PUBLIC_CONTRACT_MAX_AGE_DAYS ?? DEFAULT_MAX_MANIFEST_AGE_DAYS)

  let contractBody
  let manifestBody
  try {
    contractBody = await fetchText(fetchImpl, contractUrl)
    manifestBody = await fetchText(fetchImpl, manifestUrl)
  } catch (error) {
    // A missing artifact is a FAILURE, never "nothing to do".
    logError(`sync_public_contract: could not read the published contract: ${error.message}`)
    return 1
  }

  const result = evaluateSync({ contractBody, manifestBody, localBody: readLocal(target), now, maxAgeDays })
  for (const reason of result.reasons) log(`sync_public_contract: ${reason}`)
  if (!result.ok) return 1

  // CHECK-ONLY is the guard mode: it asserts the published artifact is present,
  // self-consistent and still being produced, and never writes. A drifted local
  // copy is not a failure here — the scheduled sync opens a PR for that — but an
  // unusable SOURCE is, which is the whole point.
  if (env.PUBLIC_CONTRACT_CHECK_ONLY === "true") {
    log(`sync_public_contract: published contract is usable (${result.action})`)
    return 0
  }
  if (result.action === "up-to-date") return 0

  writeLocal(target, result.contractBody)
  log(`sync_public_contract: updated ${target}`)

  // The specs are byte-identical after that write, so every baselined
  // divergence is now stale and the ratchet would fail on arrival.
  const baselinePath = env.PUBLIC_CONTRACT_BASELINE ?? DEFAULT_BASELINE_PATH
  const baselineBody = readLocal(baselinePath)
  if (baselineBody !== null) {
    let baseline
    try {
      baseline = JSON.parse(baselineBody)
    } catch {
      logError(`sync_public_contract: ${baselinePath} is not valid JSON; refusing to leave a broken ratchet behind`)
      return 1
    }
    const pruned = prunedBaseline(baseline)
    const removed = Object.keys(baseline?.divergences ?? {}).length
    if (removed > 0) {
      writeLocal(baselinePath, `${JSON.stringify(pruned, null, 2)}\n`)
      log(`sync_public_contract: pruned ${removed} now-stale text-parity baseline entr${removed === 1 ? "y" : "ies"}`)
    }
  }
  // 2 = "changed"; the workflow branches on it to open or update its PR.
  return 2
}

if (
  process.argv[1] &&
  [process.argv[1], (() => { try { return realpathSync(process.argv[1]) } catch { return process.argv[1] } })()]
    .some((candidate) => { try { return import.meta.url === pathToFileURL(candidate).href } catch { return false } })
) {
  process.exit(await main())
}
