import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turos-parity-"));
const write = (name, value) => { const file = path.join(dir, name); fs.writeFileSync(file, JSON.stringify(value)); return file; };
const openapi = { paths: { "/v1/filings": { get: {} }, "/v1/facts": { post: {} } } };
const catalog = { operations: [{ method: "GET", path: "/v1/filings" }, { method: "POST", path: "/v1/facts" }] };
const rendered = { items: [{ method: "GET", route: "/v1/filings" }, { httpMethod: "POST", path: "/v1/facts" }] };
const args = ["scripts/validate_cross_repo_operation_parity.mjs", write("a.json", openapi), write("b.json", openapi), write("c.json", catalog), write("d.json", rendered)];
const pass = spawnSync(process.execPath, args, { encoding: "utf8" });
assert.equal(pass.status, 0, pass.stderr);
assert.match(pass.stdout, /exact method\/path identities/);

const drifted = { paths: { "/v1/filings": { get: {} }, "/v1/other": { get: {} } } };
const fail = spawnSync(process.execPath, [...args.slice(0, 2), write("drift.json", drifted), args[3], args[4]], { encoding: "utf8" });
assert.equal(fail.status, 1);
assert.match(fail.stderr, /missing|unexpected/);
console.log("cross-repo parity guard tests passed");
