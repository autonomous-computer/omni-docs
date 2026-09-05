#!/usr/bin/env node

/**
 * Fails when the published docs claim an endpoint is unavailable while the API
 * actually serves it.
 *
 * This exists because the Fund Letters routes carried "These routes return 404
 * until the letters plane is enabled" for months after OMNI_FUND_LETTERS_ENABLED
 * was turned on in production, and the filings-intelligence routes were
 * summarised as "(currently unavailable)" while returning 200 with real data.
 * A pessimistic caveat is not a safe default: it tells paying users a working
 * feature does not exist.
 *
 * Prose that asserts unavailability is allowed only for route families that are
 * genuinely gated off in production, listed in GATED_FAMILIES below. When a flag
 * is flipped, delete its entry here and the guard will force the prose to follow.
 *
 * Usage: node scripts/check_availability_prose.mjs [openapi.json ...]
 */
import fs from "node:fs";

/**
 * Route families whose feature flag is OFF in the production datastream-api, so
 * an unavailability caveat is accurate. Verified 2026-09-01 by probing
 * https://api.secapi.ai and by `railway variables --service datastream-api`.
 */
export const GATED_FAMILIES = [
  { flag: "OMNI_EMBED_LETTERS_ENABLED", prefix: "/v1/embed/letters" },
  { flag: "OMNI_EMBED_OWNERS_ENABLED", prefix: "/v1/embed/owners/" },
  { flag: "OMNI_FILINGS_TRANSCRIPTS_ENABLED", prefix: "/v1/earnings/transcripts" },
];

/**
 * Phrases that assert an endpoint does not currently answer. Conditional
 * phrasing ("returns 404 while the market embed is off") is deliberately NOT
 * matched: it stays true whichever way the flag is set.
 */
export const UNAVAILABILITY_PATTERNS = [
  /returns? 404 until\b/i,
  /\bcurrently unavailable\b/i,
  /\bnot (?:yet |currently )?(?:publicly )?available\b/i,
  /\bcoming soon\b/i,
  /until the \w+ plane is enabled/i,
];

export function isGated(pathname) {
  return GATED_FAMILIES.some((family) => pathname.startsWith(family.prefix));
}

export function findViolations(document) {
  const violations = [];
  const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
  for (const [pathname, item] of Object.entries(document.paths ?? {})) {
    if (isGated(pathname)) continue;
    for (const [method, operation] of Object.entries(item ?? {})) {
      if (!methods.has(method) || !operation || typeof operation !== "object") continue;
      for (const field of ["summary", "description"]) {
        const text = operation[field];
        if (typeof text !== "string") continue;
        // Report at most once per field: several patterns can match one sentence.
        const match = UNAVAILABILITY_PATTERNS.map((pattern) => text.match(pattern)).find(Boolean);
        if (!match) continue;
        violations.push(
          `${method.toUpperCase()} ${pathname}: ${field} claims unavailability (${JSON.stringify(match[0])}) but the route is not in a gated-off family. If the flag really is off, add its family to GATED_FAMILIES; otherwise correct the prose.`,
        );
      }
    }
  }
  return violations;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const inputs = process.argv.slice(2);
  const files = inputs.length > 0 ? inputs : ["openapi/sec-api-public.v1.json"];
  const failures = [];
  let operations = 0;
  for (const file of files) {
    const document = JSON.parse(fs.readFileSync(file, "utf8"));
    operations += Object.values(document.paths ?? {}).reduce(
      (total, item) => total + Object.keys(item ?? {}).length,
      0,
    );
    for (const violation of findViolations(document)) failures.push(`${file}: ${violation}`);
  }
  if (operations === 0) {
    console.error("check_availability_prose: no operations inspected; refusing to pass vacuously");
    process.exit(1);
  }
  if (failures.length > 0) {
    console.error(`check_availability_prose: ${failures.length} failure(s)\n`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`check_availability_prose: OK (${operations} operations inspected)`);
}
