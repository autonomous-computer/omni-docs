#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turos-operation-reference-"));
fs.mkdirSync(path.join(dir, "api-reference"));
fs.writeFileSync(path.join(dir, "api-reference", "example.mdx"), "---\ntitle: Example\n---\n");
fs.writeFileSync(path.join(dir, "llms.txt"), "TUROS\n");
const openapi = { paths: { "/v1/example": { get: {
  tags: ["Example"], summary: "Example", description: "Returns an example.",
  "x-turos": { domain: "example", availability: "live", access: "public", meterClass: "read", sourceFields: [], freshnessFields: [] },
} } } };
const baseRecord = { method: "get", path: "/v1/example", tag: "Example", domain: "example", docsPath: "api-reference/example.mdx", summary: "Example", description: "Returns an example.", availability: "live", access: "public", meterClass: "read", sourceFields: [], freshnessFields: [], workflows: [], inputs: [], examples: [], responseFields: [] };
const run = (catalog) => {
  const openapiFile = path.join(dir, "openapi.json");
  const catalogFile = path.join(dir, "catalog.json");
  fs.writeFileSync(openapiFile, JSON.stringify(openapi));
  fs.writeFileSync(catalogFile, JSON.stringify({ operations: [catalog], llmsPath: "llms.txt", discoveryPaths: [] }));
  return spawnSync(process.execPath, [path.resolve("scripts/validate_operation_reference.mjs"), openapiFile, catalogFile], { cwd: dir, encoding: "utf8" });
};

assert.equal(run(baseRecord).status, 0, "valid catalog should pass");
for (const docsPath of ["", "/tmp/example.mdx", "api-reference/../llms.txt", "api-reference/missing.mdx"]) {
  assert.notEqual(run({ ...baseRecord, docsPath }).status, 0, `invalid docsPath should fail: ${docsPath}`);
}
fs.symlinkSync(path.join(dir, "llms.txt"), path.join(dir, "api-reference", "escape.mdx"));
assert.notEqual(run({ ...baseRecord, docsPath: "api-reference/escape.mdx" }).status, 0, "escaping docs symlink should fail");
for (const [field, value] of [["llmsPath", ""], ["llmsPath", "/tmp/llms.txt"], ["llmsPath", "../llms.txt"], ["discoveryPaths", "not-an-array"]]) {
  const openapiFile = path.join(dir, "openapi.json");
  const catalogFile = path.join(dir, "catalog.json");
  fs.writeFileSync(openapiFile, JSON.stringify(openapi));
  fs.writeFileSync(catalogFile, JSON.stringify({ operations: [baseRecord], llmsPath: "llms.txt", discoveryPaths: [], [field]: value }));
  const result = spawnSync(process.execPath, [path.resolve("scripts/validate_operation_reference.mjs"), openapiFile, catalogFile], { cwd: dir, encoding: "utf8" });
  assert.notEqual(result.status, 0, `invalid ${field} should fail: ${value}`);
}
console.log("validate_operation_reference malformed-path fixtures passed");
