import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const GUARD = path.resolve("scripts/check_internal_vocabulary.mjs");

/** Build a throwaway docs tree and run the guard against it. */
const run = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turos-vocab-"));
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  // Every fixture carries the two real allowlisted lines so the stale-entry
  // check (itself asserted below) does not mask the assertion under test.
  return spawnSync(process.execPath, [GUARD, dir], { encoding: "utf8" });
};

const ALLOWLISTED = {
  "docs.json": JSON.stringify({
    redirects: [
      {
        source:
          "/api-reference/return-the-launch-ring-tier-1-high-signal-macro-pack-with-explicit-source-fallback-and-release-calendar-posture-for-supported-countries",
        destination: "/api-reference/macro-high-signal-pack",
      },
    ],
  }),
  "test-mode.mdx": 'export SECAPI_API_KEY="secapi_test_..."\n',
};

// --- clean surface passes -------------------------------------------------
const clean = run({ ...ALLOWLISTED, "a.mdx": "Coverage groups are `core` and `extended`.\n" });
assert.equal(clean.status, 0, clean.stderr);
assert.match(clean.stdout, /Internal vocabulary check passed/);

// --- each rule fires, naming the file and the rule -------------------------
const cases = [
  ["launch-ring", "b.mdx", "The launch_ring_1 group ships first.\n"],
  ["launch-ring", "b.mdx", "The launch ring covers G10.\n"],
  ["tier-n-expansion", "b.mdx", "Countries in tier_1_expansion follow.\n"],
  ["internal-plane", "b.mdx", "Crossed with the country macro plane.\n"],
  ["internal-plane", "b.mdx", "Outside the US factor plane.\n"],
  ["internal-plane", "b.mdx", "The filings-intelligence plane is disabled.\n"],
  ["leaked-env-name", "b.mdx", "Set OMNI_FOO_ENABLED to turn this on.\n"],
  ["leaked-env-name", "b.mdx", "Set SECAPI_INTERNAL_FLAG to turn this on.\n"],
  ["launch-ring", "openapi/spec.json", '{"ring":"launch_ring_1"}\n'],
];
for (const [rule, file, body] of cases) {
  const result = run({ ...ALLOWLISTED, [file]: body });
  assert.equal(result.status, 1, `expected failure for ${rule} / ${JSON.stringify(body)}`);
  assert.match(result.stderr, new RegExp(`${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:1: \\[${rule}\\]`), result.stderr);
}

// --- evasions an enumerated denylist would miss ----------------------------
// Adversarial review found all of these passing an earlier, narrower ruleset.
for (const [rule, body] of [
  ["internal-plane", "The filings plane is disabled.\n"],
  ["internal-plane", "The coverage plane rolls up.\n"],
  ["internal-plane", "See the news plane.\n"],
  ["internal-plane", "The signal plane ranks these.\n"],
  ["internal-plane", "Served by macro_plane today.\n"],
  ["internal-plane", "Both macro planes are covered.\n"],
  ["internal-plane", "Rendered by the Macro  Plane service.\n"],
  ["launch-ring", "Shipping in the launch  ring first.\n"],
  ["tier-n-expansion", "Countries in tier_one_expansion follow.\n"],
  ["tier-n-expansion", "Countries in ring_1_expansion follow.\n"],
  ["leaked-env-name", "Set OMNI_ETL to point at the warehouse.\n"],
  ["leaked-env-name", "Set DATASTREAM_INTERNAL_ONLY to true.\n"],
  ["leaked-env-name", "Set PERIGON_PREMIUM_COMPANY_FILTERS to true.\n"],
]) {
  const result = run({ ...ALLOWLISTED, "e.mdx": body });
  assert.equal(result.status, 1, `evasion not caught: ${JSON.stringify(body)}`);
  assert.match(result.stderr, new RegExp(`e\\.mdx:1: \\[${rule}\\]`), result.stderr);
}

// A YAML OpenAPI spec is published content too; changing extension must not
// silently drop the highest-risk file from the scanned set.
const yaml = run({ ...ALLOWLISTED, "openapi/spec.yaml": "description: the macro plane\n" });
assert.equal(yaml.status, 1, yaml.stderr);
assert.match(yaml.stderr, /openapi\/spec\.yaml:1: \[internal-plane\]/);

// --- documented public/legacy strings must NOT fire ------------------------
for (const body of [
  'export SECAPI_API_KEY="secapi_..."\n',
  "Authorization: Bearer omni_live_...\n",
  "Use the omni_api_get_symbol tool.\n",
  // #46 / omni-datastream #2628 keep a deprecated `ring` PROPERTY; only the
  // rollout phrasing is internal. This asserts the guard does not fight them.
  '{"ring":{"deprecated":true},"coverageTier":{"enum":["core","extended"]}}\n',
  "This is a control plane for your team.\n",
  "The coverageTier is core or extended.\n",
]) {
  const ok = run({ ...ALLOWLISTED, "c.mdx": body });
  assert.equal(ok.status, 0, `false positive on ${JSON.stringify(body)}: ${ok.stderr}`);
}

// --- an allowlist entry that stops matching is an error, not a no-op -------
const stale = run({ "a.mdx": "nothing interesting here\n" });
assert.equal(stale.status, 1);
assert.match(stale.stderr, /Stale allowlist entries/);

// --- refuses to pass vacuously on an empty tree ----------------------------
const empty = run({});
assert.equal(empty.status, 2, empty.stderr);
assert.match(empty.stderr, /Refusing to pass vacuously/);

// --- internal-only directories are out of scope ----------------------------
const internal = run({ ...ALLOWLISTED, ".github/rewrite/FACTS.md": "OMNI_FUND_LETTERS_ENABLED is on.\n" });
assert.equal(internal.status, 0, internal.stderr);

console.log("internal vocabulary guard tests passed");
