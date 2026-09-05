import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turos-parity-"));
const write = (name, value) => { const file = path.join(dir, name); fs.writeFileSync(file, JSON.stringify(value)); return file; };
const openapi = { paths: { "/v1/filings": { get: {}, post: { "x-turos": { visibility: "private" } } }, "/v1/facts": { post: {} } } };
const catalog = { operations: [{ method: "GET", path: "/v1/filings" }, { method: "POST", path: "/v1/facts" }, { method: "POST", path: "/v1/filings", public: false }] };
const rendered = { items: [{ method: "GET", route: "/v1/filings" }, { httpMethod: "POST", path: "/v1/facts" }, { method: "POST", path: "/v1/filings", internal: true }] };
const args = ["scripts/validate_cross_repo_operation_parity.mjs", write("a.json", openapi), write("b.json", openapi), write("c.json", catalog), write("d.json", rendered)];
const pass = spawnSync(process.execPath, args, { encoding: "utf8" });
assert.equal(pass.status, 0, pass.stderr);
assert.match(pass.stdout, /exact method\/path identities/);

const drifted = { paths: { "/v1/filings": { get: {} }, "/v1/other": { get: {} } } };
const fail = spawnSync(process.execPath, [...args.slice(0, 2), write("drift.json", drifted), args[3], args[4]], { encoding: "utf8" });
assert.equal(fail.status, 1);
assert.match(fail.stderr, /missing|unexpected/);

const duplicate = spawnSync(process.execPath, [args[0], args[1], args[2], write("duplicate.json", { operations: [...catalog.operations, { method: "GET", path: "/v1/filings" }] }), args[4]], { encoding: "utf8" });
assert.equal(duplicate.status, 1);
assert.match(duplicate.stderr, /duplicate/);

const privateDuplicate = spawnSync(process.execPath, [args[0], args[1], args[2], write("private-duplicate.json", { operations: [
  { method: "GET", path: "/v1/filings", public: false },
  { method: "GET", path: "/v1/filings", internal: true },
  ...catalog.operations.slice(0, 2),
] }), args[4]], { encoding: "utf8" });
assert.equal(privateDuplicate.status, 1);
assert.match(privateDuplicate.stderr, /duplicate/);

const privateFirstPublicSecond = spawnSync(process.execPath, [args[0], args[1], args[2], write("private-first.json", { operations: [
  { method: "GET", path: "/v1/filings", public: false },
  { method: "GET", path: "/v1/filings" },
  { method: "POST", path: "/v1/facts" },
] }), args[4]], { encoding: "utf8" });
assert.equal(privateFirstPublicSecond.status, 1);
assert.match(privateFirstPublicSecond.stderr, /duplicate/);

const malformed = spawnSync(process.execPath, [args[0], write("malformed.json", { paths: { "/v1/filings": null } }), args[2], args[3], args[4]], { encoding: "utf8" });
assert.equal(malformed.status, 1);
assert.match(malformed.stderr, /malformed/);
// ---------------------------------------------------------------------------
// Text parity: identical method/path identities, divergent description/summary.
// This is the exact shape of the 2026-09-01 incident, which the identity-only
// guard passed green.
// ---------------------------------------------------------------------------
const textSpec = (description, summary) => ({
  paths: { "/v1/macro/pack": { get: { summary, description } } },
});
const twoSpecs = (a, b, extra = []) =>
  spawnSync(process.execPath, [args[0], write(`t${Math.random()}.json`, a), write(`t${Math.random()}.json`, b), ...extra], { encoding: "utf8" });

// Agreeing text passes.
const agree = twoSpecs(textSpec("Country macro indicators.", "Macro pack"), textSpec("Country macro indicators.", "Macro pack"));
assert.equal(agree.status, 0, agree.stderr);
assert.match(agree.stdout, /text parity passed/);

// Whitespace-only differences are normalized away, not reported.
const whitespace = twoSpecs(
  textSpec("Country macro indicators.", "Macro pack"),
  textSpec("  Country   macro\n indicators. ", "Macro pack"),
);
assert.equal(whitespace.status, 0, whitespace.stderr);

// A divergent description fails and names the operation and the field.
const divergent = twoSpecs(
  textSpec("Country macro indicators.", "Macro pack"),
  textSpec("The country macro plane.", "Macro pack"),
);
assert.equal(divergent.status, 1);
assert.match(divergent.stderr, /GET \/v1\/macro\/pack\|description/);
assert.match(divergent.stderr, /TEXT parity failed/);

// A divergent summary fails too.
const divergentSummary = twoSpecs(
  textSpec("Same.", "Macro pack"),
  textSpec("Same.", "Launch ring pack"),
);
assert.equal(divergentSummary.status, 1);
assert.match(divergentSummary.stderr, /GET \/v1\/macro\/pack\|summary/);

// A baselined divergence is tolerated...
const digest = (expected, actual) =>
  crypto.createHash("sha256").update(`${expected}\u0000${actual}`).digest("hex").slice(0, 16);
const baselineFile = write("baseline.json", {
  divergences: {
    "GET /v1/macro/pack|description": {
      // Clean-but-different wording. Leaky text can no longer be baselined,
      // which the laundering case below asserts.
      digest: digest("Country macro indicators.", "A different but clean wording."),
      reason: "test fixture",
    },
  },
});
const baselined = twoSpecs(
  textSpec("Country macro indicators.", "Macro pack"),
  textSpec("A different but clean wording.", "Macro pack"),
  ["--text-baseline", baselineFile],
);
assert.equal(baselined.status, 0, baselined.stderr);
assert.match(baselined.stdout, /1 baselined divergence/);

// ...but a baseline entry that no longer diverges FAILS, so the file cannot rot
// into a permanent silent skip.
const staleBaseline = twoSpecs(
  textSpec("Country macro indicators.", "Macro pack"),
  textSpec("Country macro indicators.", "Macro pack"),
  ["--text-baseline", baselineFile],
);
assert.equal(staleBaseline.status, 1);
assert.match(staleBaseline.stderr, /Stale text-parity baseline/);

// A baseline covering one field must not excuse the other.
const partialBaseline = twoSpecs(
  textSpec("Country macro indicators.", "Macro pack"),
  textSpec("A different but clean wording.", "Another clean summary"),
  ["--text-baseline", baselineFile],
);
assert.equal(partialBaseline.status, 1);
assert.match(partialBaseline.stderr, /GET \/v1\/macro\/pack\|summary/);

// A baselined entry whose text CHANGED must fail: keying on the operation alone
// would let a baselined description be rewritten to any other divergent value,
// including freshly leaked vocabulary. Mutation testing found this hole.
const rewritten = twoSpecs(
  textSpec("Country macro indicators.", "Macro pack"),
  textSpec("Some entirely different wording.", "Macro pack"),
  ["--text-baseline", baselineFile],
);
assert.equal(rewritten.status, 1);
assert.match(rewritten.stderr, /text CHANGED since it was baselined/);

// A baseline entry must not launder a fresh leak: the digest is generated from
// whatever text is present, so a same-PR addition would otherwise pass.
const leak = "Return the launch_ring_1 tier_1_expansion macro plane snapshot.";
const launderFile = write("launder.json", {
  divergences: {
    "GET /v1/macro/pack|description": {
      digest: digest("Country macro indicators.", leak),
      reason: "deliberate divergence, totally legitimate",
    },
  },
});
const laundered = twoSpecs(
  textSpec("Country macro indicators.", "Macro pack"),
  textSpec(leak, "Macro pack"),
  ["--text-baseline", launderFile],
);
assert.equal(laundered.status, 1, laundered.stdout);
assert.match(laundered.stderr, /baselined text contains internal vocabulary/);

// Two documents with no public operations compare equal; that must not pass.
const vacuous = twoSpecs({ openapi: "3.1.0", paths: {} }, { openapi: "3.1.0", paths: {} });
assert.equal(vacuous.status, 2, vacuous.stdout);
assert.match(vacuous.stderr, /Refusing to pass vacuously/);

// The real repo baseline must be well formed. Empty is the expected steady
// state: scripts/sync_public_contract.mjs pulls the published contract
// wholesale, so the two documents are byte-identical and no divergence can
// exist. An entry here means someone hand-edited this repo's copy.
const realBaseline = JSON.parse(fs.readFileSync("scripts/cross_repo_text_parity_baseline.json", "utf8"));
assert.ok(realBaseline.divergences && typeof realBaseline.divergences === "object", "baseline must have a divergences object");
for (const [key, value] of Object.entries(realBaseline.divergences)) {
  assert.match(key, /^[A-Z]+ \/\S* ?\S*\|(summary|description)$/, `malformed baseline key ${key}`);
  assert.match(value.digest, /^[0-9a-f]{16}$/, `malformed digest for ${key}`);
  assert.ok(value.reason?.length > 0, `baseline entry ${key} needs a reason`);
}

console.log("cross-repo parity guard tests passed");
