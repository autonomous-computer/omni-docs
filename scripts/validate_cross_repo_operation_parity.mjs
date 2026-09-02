#!/usr/bin/env node

/**
 * Compare the public operation set at each generated-artifact boundary, and the
 * operation TEXT between the two OpenAPI documents.
 *
 * Usage:
 *   node scripts/validate_cross_repo_operation_parity.mjs \
 *     <datastream-openapi.json> <docs-openapi.json> <catalog.json> <rendered.json> \
 *     [--text-baseline <baseline.json>]
 *
 * Identity parity deliberately compares method/path identities, rather than
 * operation counts. Counts are useful evidence but cannot detect a replacement
 * that leaves the count unchanged.
 *
 * Identity parity is NOT sufficient on its own. On 2026-09-01 omni-datastream
 * purged internal vocabulary from its spec; the sync carried it to
 * docs.secapi.ai, while omni-docs — which Mintlify builds directly for
 * www.turos.app/docs from its own copy of the spec — got none of it. All 288
 * operations still matched on both sides by method and path, so an
 * identity-only guard stayed green while the rendered page served
 * `launch_ring_1` and "macro plane" for hours. Only the DESCRIPTION and SUMMARY
 * text diverged.
 *
 * So text parity is enforced too, over the common operations of the two OpenAPI
 * documents, after whitespace normalization.
 *
 * SCOPE, precisely: this compares operation-level `summary` and `description`
 * only. In the 2026-09-01 spec, 18 strings carried the leaked vocabulary and
 * just ONE of them sat at a location this comparison reads; the other 17 lived
 * in `responses.*.description`, response `examples[].value`, and
 * `components.schemas.*`. So this rule is NOT a complete leak detector, and must
 * not be read as one. `scripts/check_internal_vocabulary.mjs` is the guard that
 * covers the whole published surface; this one covers cross-repo DRIFT.
 *
 * The two specs are independently maintained and carry some deliberately
 * different prose, so a baseline file records the divergences that exist today.
 * It is a RATCHET, not a mute button: any divergence not in the baseline fails,
 * and a baseline entry that no longer diverges also fails, so the file cannot
 * rot into a silent skip and must shrink as the specs converge.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { RULES as VOCABULARY_RULES } from "./check_internal_vocabulary.mjs";

const argv = process.argv.slice(2);
let textBaselinePath = null;
const baselineFlag = argv.indexOf("--text-baseline");
if (baselineFlag !== -1) {
  textBaselinePath = argv[baselineFlag + 1];
  if (!textBaselinePath) {
    console.error("--text-baseline requires a path");
    process.exit(2);
  }
  argv.splice(baselineFlag, 2);
}
const [datastreamPath, docsPath, catalogPath, renderedPath] = argv;
// The catalog and rendered-inventory artifacts are optional: omni-docs does not
// build either one, and requiring all four is precisely what left this guard
// unwired — able to run only against fixtures in its own test. The two OpenAPI
// documents are the artifacts this repo actually has, and they are the pair
// that diverged in the incident this guard exists for.
if (![datastreamPath, docsPath].every(Boolean)) {
  console.error("Usage: validate_cross_repo_operation_parity.mjs <datastream-openapi.json> <docs-openapi.json> [<catalog.json> <rendered.json>] [--text-baseline <baseline.json>]");
  process.exit(2);
}
if (Boolean(catalogPath) !== Boolean(renderedPath)) {
  console.error("catalog and rendered inventory must be supplied together");
  process.exit(2);
}

const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
const read = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const isPublicOperation = (value) => {
  const extension = value?.["x-turos"] ?? value;
  return value?.internal !== true && value?.public !== false && value?.["x-internal"] !== true
    && extension?.public !== false && extension?.visibility !== "private" && extension?.visibility !== "internal";
};
const openapiKeys = (document) => {
  if (!document || !document.paths || typeof document.paths !== "object" || Array.isArray(document.paths)) throw new Error("OpenAPI: paths must be an object");
  const keys = new Set();
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    if (!path.startsWith("/") || !item || typeof item !== "object" || Array.isArray(item)) throw new Error(`OpenAPI: malformed path item ${path}`);
    for (const method of Object.keys(item ?? {})) {
      if (methods.has(method.toLowerCase()) && isPublicOperation(item[method])) keys.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return keys;
};
const publicOperations = (document) => {
  const operations = new Map();
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(item ?? {})) {
      if (methods.has(method.toLowerCase()) && isPublicOperation(operation)) {
        operations.set(`${method.toUpperCase()} ${path}`, operation ?? {});
      }
    }
  }
  return operations;
};
const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
/** Pins both sides of a baselined divergence, so either one changing fails. */
const fingerprint = (expected, actual) =>
  crypto.createHash("sha256").update(`${expected}\u0000${actual}`).digest("hex").slice(0, 16);
const recordKey = (record) => {
  const method = String(record?.method ?? record?.httpMethod ?? "").toUpperCase();
  const path = String(record?.path ?? record?.route ?? "");
  return method && path ? `${method} ${path}` : null;
};
const recordsKeys = (value, label) => {
  const records = Array.isArray(value) ? value : value?.operations ?? value?.items;
  if (!Array.isArray(records)) throw new Error(`${label}: expected an operations or items array`);
  const keys = new Set();
  const publicKeys = new Set();
  const duplicates = [];
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${label}: malformed operation record`);
    const key = recordKey(record);
    if (!key || !methods.has(key.split(" ", 1)[0].toLowerCase())) throw new Error(`${label}: invalid operation record ${JSON.stringify(record)}`);
    if (keys.has(key)) duplicates.push(key);
    keys.add(key);
    if (isPublicOperation(record)) publicKeys.add(key);
  }
  if (duplicates.length) throw new Error(`${label}: duplicate operation(s): ${duplicates.join(", ")}`);
  return publicKeys;
};
const allowlistKeys = (value) => {
  if (value?.operations || value?.items || Array.isArray(value)) return recordsKeys(value, "catalog/allowlist");
  const paths = value?.paths;
  if (!paths || typeof paths !== "object") throw new Error("catalog/allowlist: expected operations, items, or paths");
  const keys = new Set();
  for (const [path, entry] of Object.entries(paths)) {
    if (!path.startsWith("/") || (!Array.isArray(entry) && (!entry || typeof entry !== "object"))) throw new Error(`catalog/allowlist: malformed path map ${path}`);
    const seen = new Set();
    for (const method of Array.isArray(entry) ? entry : Object.keys(entry)) {
      const normalized = String(method).toUpperCase();
      if (!methods.has(normalized.toLowerCase())) continue;
      if (seen.has(normalized)) throw new Error(`catalog/allowlist: duplicate operation ${normalized} ${path}`);
      seen.add(normalized);
      const metadata = Array.isArray(entry) ? {} : entry[method];
      if (isPublicOperation(metadata)) keys.add(`${normalized} ${path}`);
    }
  }
  return keys;
};
const sets = new Map([
  ["datastream OpenAPI", openapiKeys(read(datastreamPath))],
  ["docs OpenAPI", openapiKeys(read(docsPath))],
  ...(catalogPath
    ? [
        ["public catalog/allowlist", allowlistKeys(read(catalogPath))],
        ["rendered operation inventory", recordsKeys(read(renderedPath), "rendered inventory")],
      ]
    : []),
]);
const [firstLabel, first] = sets.entries().next().value;
// Two documents with no public operations compare equal and would "pass". The
// workflow also asserts a path count on the fetched file, but that check lives
// in YAML, counts paths rather than public operations, and does not survive
// reuse of this script elsewhere. Refuse here too.
if (first.size === 0) {
  console.error(`${firstLabel}: no public operations found. Refusing to pass vacuously.`);
  process.exit(2);
}
const failures = [];
for (const [label, current] of sets) {
  for (const key of first) if (!current.has(key)) failures.push(`${label}: missing ${key}`);
  for (const key of current) if (!first.has(key)) failures.push(`${label}: unexpected ${key}`);
}
if (failures.length) {
  console.error(`Cross-repository operation parity failed (${failures.length} difference(s)); reference: ${firstLabel}`);
  console.error(failures.slice(0, 100).join("\n"));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Text parity: description and summary must agree between the two OpenAPI
// documents. This is the rule that catches a one-sided vocabulary purge.
// ---------------------------------------------------------------------------
const TEXT_FIELDS = ["summary", "description"];
const datastreamOperations = publicOperations(read(datastreamPath));
const docsOperations = publicOperations(read(docsPath));

let baseline = {};
if (textBaselinePath) {
  baseline = read(textBaselinePath)?.divergences ?? {};
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    console.error(`${textBaselinePath}: expected an object under "divergences"`);
    process.exit(2);
  }
}

const textFailures = [];
const matchedBaseline = new Set();
for (const [key, datastreamOperation] of datastreamOperations) {
  const docsOperation = docsOperations.get(key);
  if (!docsOperation) continue; // identity parity above already owns this case.
  for (const field of TEXT_FIELDS) {
    const expected = normalizeText(datastreamOperation[field]);
    const actual = normalizeText(docsOperation[field]);
    if (expected === actual) continue;
    const entry = `${key}|${field}`;
    const recorded = baseline[entry];
    if (recorded) {
      // A baseline entry must never launder a fresh leak. The digest pins the
      // text against later drift, but it is generated FROM whatever text is
      // present, so a same-PR addition would otherwise sail through. Run the
      // vocabulary rules over both sides before honouring the entry.
      const dirty = VOCABULARY_RULES.filter((rule) => {
        const hit = actual.match(rule.pattern) ?? expected.match(rule.pattern);
        return hit && !rule.ignore?.(hit);
      });
      if (dirty.length) {
        textFailures.push(
          `${entry}: baselined text contains internal vocabulary [${dirty.map((rule) => rule.id).join(", ")}]; ` +
            `a baseline entry cannot excuse a leak\n    docs: ${JSON.stringify(actual.slice(0, 200))}`,
        );
        matchedBaseline.add(entry);
        continue;
      }
      // The baseline pins the EXACT text it excuses, by digest. Keying on the
      // operation alone would let a baselined description be rewritten to any
      // other divergent value — including freshly leaked vocabulary — and still
      // pass. Mutation testing caught precisely that hole.
      const digest = fingerprint(expected, actual);
      if (recorded.digest === digest) {
        matchedBaseline.add(entry);
        continue;
      }
      textFailures.push(
        `${entry}: text CHANGED since it was baselined (baseline pins ${recorded.digest}, found ${digest})\n` +
          `    datastream: ${JSON.stringify(expected.slice(0, 200))}\n` +
          `    docs:       ${JSON.stringify(actual.slice(0, 200))}`,
      );
      matchedBaseline.add(entry);
      continue;
    }
    textFailures.push(
      `${entry}: text differs between the datastream and docs specs\n` +
        `    datastream: ${JSON.stringify(expected.slice(0, 200))}\n` +
        `    docs:       ${JSON.stringify(actual.slice(0, 200))}`,
    );
  }
}

// A baseline entry that no longer diverges means the debt was paid. Fail so the
// file shrinks instead of silently widening what the guard ignores.
const staleBaseline = Object.keys(baseline).filter((entry) => !matchedBaseline.has(entry));

if (textFailures.length || staleBaseline.length) {
  if (textFailures.length) {
    console.error(`Cross-repository TEXT parity failed (${textFailures.length} divergence(s) not in the baseline):`);
    console.error(textFailures.slice(0, 100).join("\n"));
  }
  if (staleBaseline.length) {
    console.error(
      `\nStale text-parity baseline entries (${staleBaseline.length}) — these now agree, remove them from ${textBaselinePath}:\n` +
        staleBaseline.slice(0, 100).map((entry) => `  ${entry}`).join("\n"),
    );
  }
  process.exit(1);
}

console.log(
  `Cross-repository operation parity passed: ${first.size} exact method/path identities across ${sets.size} artifacts; ` +
    `text parity passed over ${datastreamOperations.size} operations x ${TEXT_FIELDS.length} fields ` +
    `(${Object.keys(baseline).length} baselined divergence(s), all still diverging)`,
);
