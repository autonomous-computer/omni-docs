#!/usr/bin/env node

/**
 * Fail when internal rollout vocabulary appears anywhere on the published docs
 * surface.
 *
 * Why this exists, concretely: on 2026-09-01 omni-datastream purged internal
 * vocabulary from its OpenAPI spec (PR #2618). That purge reached
 * https://docs.secapi.ai through the `sync-docs-to-mintlify` workflow, but
 * omni-docs — which Mintlify builds directly for https://www.turos.app/docs —
 * carries its OWN copy of the spec and got none of it. Hours later the public
 * page still served `launch_ring_1`, `tier_1_expansion` and "macro plane".
 *
 * The cross-repo parity guard could not catch it: the operations existed on
 * both sides with identical method/path identities, and only the *text*
 * diverged. This guard is text-first and single-repo, so it fires even when
 * the two specs agree with each other on bad wording.
 *
 * Usage:  node scripts/check_internal_vocabulary.mjs [root]
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(process.argv[2] ?? ".");

// Directories Mintlify does not serve. Excluded so the guard describes the
// PUBLIC surface: `.github/` holds internal rewrite notes that legitimately
// name internal flags, and `scripts/` holds this guard, whose own patterns
// would otherwise match themselves.
const SKIP_DIRS = new Set([".git", ".github", "scripts", "node_modules"]);
// .yaml/.yml included: Mintlify accepts YAML OpenAPI specs, so omitting them
// would let the highest-risk published file leave the scanned set silently by
// changing extension while the guard still printed a happy file count.
const EXTENSIONS = new Set([".mdx", ".md", ".json", ".txt", ".yaml", ".yml"]);

// `... plane` phrases that are ordinary public English rather than internal
// architecture jargon. An allow-set lets the rule match a broad "<word> plane"
// instead of enumerating only the words that happened to leak once.
export const PUBLIC_PLANE_TERMS = new Set(["control"]);

export const RULES = [
  {
    id: "launch-ring",
    // `ring` alone is deliberately NOT matched: omni-docs #46 / omni-datastream
    // #2628 keep a deprecated `ring` PROPERTY for backwards compatibility while
    // replacing its internal VALUES with the neutral `coverageTier`
    // core/extended. Only the rollout phrasing is internal.
    // `[-_ ]*` not `[-_ ]?`, so "launch  ring" cannot slip past.
    pattern: /launch[-_ ]*ring/i,
    message: "internal rollout phase name (`launch ring`); use the neutral `coverageTier` values `core` / `extended`",
  },
  {
    id: "tier-n-expansion",
    // Covers `ring_1_expansion` as well as `tier_1_*`, and spelled-out ordinals.
    pattern: /\b(?:tier|ring)[-_ ]*(?:\d+|one|two|three)[-_ ]*(?:expansion|pack|coverage)\b/i,
    message: "internal rollout tier name (`tier_1_expansion` and friends); use `coverageTier` `core` / `extended`",
  },
  {
    id: "internal-plane",
    // Broad on purpose. Enumerating the six words that had already leaked let
    // `filings plane`, `signal plane` and `macro_plane` through — and snake_case
    // is exactly the form the leaked enum values took. Any "<word> plane" is
    // jargon now unless it is in PUBLIC_PLANE_TERMS.
    pattern: /\b([A-Za-z][\w-]*)[-_ ]+planes?\b/i,
    message: "internal architecture jargon (`... plane`); name the user-facing thing instead (API, universe, indicators)",
    ignore: (match) => PUBLIC_PLANE_TERMS.has(match[1].toLowerCase()),
  },
  {
    id: "leaked-env-name",
    // Case-SENSITIVE on purpose. The published docs legitimately show lowercase
    // product identifiers (`omni_live_...`, `omni_api_get_symbol`,
    // `secapi_test_...`); only UPPER_SNAKE names read as server-side env flags.
    // Prefixes cover this org's services; the length floor is low enough for
    // short real flags such as OMNI_ETL.
    pattern: /\b(?:OMNI|SECAPI|DATASTREAM|MERLIN|PERIGON|TUROS)_[A-Z][A-Z0-9_]{1,}\b/,
    message: "server-side environment/flag name leaked into public docs",
  },
];

/**
 * Small, explicit, documented exceptions. Each entry must name the file, the
 * rule it excuses, a literal substring of the offending line, and WHY.
 *
 * An entry that stops matching is a hard error rather than a quiet no-op, so
 * this list cannot rot into a permanent silent skip.
 */
const ALLOWLIST = [
  {
    file: "docs.json",
    rule: "launch-ring",
    contains: "/api-reference/return-the-launch-ring-tier-1-high-signal-macro-pack",
    reason:
      "Legacy redirect SOURCE. This slug was published, so it must keep resolving; the destination (/api-reference/macro-high-signal-pack) is already clean. Deleting the source would 404 existing links.",
  },
  {
    rule: "leaked-env-name",
    contains: "SECAPI_API_KEY",
    reason:
      "Documented PUBLIC client env var. Every SDK and quickstart tells users to export it; it is not a server-side flag.",
  },
];

const walk = (dir) => {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    // statSync, not entry.isDirectory(): the latter is false for a SYMLINKED
    // content directory, which would drop a whole published tree silently.
    if (fs.statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walk(full));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
};

// Everything below is the CLI entry point. Guarded so that importing this file
// for its RULES (the parity guard does, to stop a baseline entry laundering a
// leak) does not run a scan as a side effect.
const main = () => {
const used = new Set();
const isAllowed = (relative, ruleId, line) =>
  ALLOWLIST.some((entry, index) => {
    if (entry.rule !== ruleId) return false;
    if (entry.file && entry.file !== relative) return false;
    if (!line.includes(entry.contains)) return false;
    used.add(index);
    return true;
  });

const files = walk(ROOT).sort();
if (files.length === 0) {
  console.error(`No documentation files found under ${ROOT}. Refusing to pass vacuously.`);
  process.exit(2);
}

const failures = [];
for (const file of files) {
  const relative = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      const match = line.match(rule.pattern);
      if (!match) continue;
      if (rule.ignore?.(match)) continue;
      if (isAllowed(relative, rule.id, line)) continue;
      failures.push(`${relative}:${index + 1}: [${rule.id}] ${rule.message}\n    matched: ${JSON.stringify(match[0])}`);
    }
  });
}

// A stale allowlist entry means the exception is no longer real. Fail loudly so
// the list stays honest instead of quietly widening what the guard ignores.
const stale = ALLOWLIST.map((entry, index) => ({ entry, index }))
  .filter(({ index }) => !used.has(index))
  .map(({ entry }) => `  ${entry.file ?? "<any file>"} [${entry.rule}] ${JSON.stringify(entry.contains)}`);

if (failures.length || stale.length) {
  if (failures.length) {
    console.error(`Internal vocabulary found on the public docs surface (${failures.length} occurrence(s)):`);
    console.error(failures.join("\n"));
  }
  if (stale.length) {
    console.error(`\nStale allowlist entries (matched nothing — remove them):\n${stale.join("\n")}`);
  }
  process.exit(1);
}

console.log(
  `Internal vocabulary check passed: ${files.length} published files scanned against ${RULES.length} rules ` +
    `(${ALLOWLIST.length} documented exception(s), all still matching).`,
);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
