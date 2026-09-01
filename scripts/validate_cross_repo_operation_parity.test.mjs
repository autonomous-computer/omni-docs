import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
console.log("cross-repo parity guard tests passed");
