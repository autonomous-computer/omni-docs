#!/usr/bin/env node

/**
 * Compare the public operation set at each generated-artifact boundary.
 *
 * Usage:
 *   node scripts/validate_cross_repo_operation_parity.mjs \
 *     <datastream-openapi.json> <docs-openapi.json> <catalog.json> <rendered.json>
 *
 * This deliberately compares method/path identities, rather than operation
 * counts. Counts are useful evidence but cannot detect a replacement that
 * leaves the count unchanged.
 */
import fs from "node:fs";

const [datastreamPath, docsPath, catalogPath, renderedPath] = process.argv.slice(2);
if (![datastreamPath, docsPath, catalogPath, renderedPath].every(Boolean)) {
  console.error("Usage: validate_cross_repo_operation_parity.mjs <datastream-openapi.json> <docs-openapi.json> <catalog.json> <rendered.json>");
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
const recordKey = (record) => {
  const method = String(record?.method ?? record?.httpMethod ?? "").toUpperCase();
  const path = String(record?.path ?? record?.route ?? "");
  return method && path ? `${method} ${path}` : null;
};
const recordsKeys = (value, label) => {
  const records = Array.isArray(value) ? value : value?.operations ?? value?.items;
  if (!Array.isArray(records)) throw new Error(`${label}: expected an operations or items array`);
  const keys = new Set();
  const duplicates = [];
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${label}: malformed operation record`);
    const key = recordKey(record);
    if (!key || !methods.has(key.split(" ", 1)[0].toLowerCase())) throw new Error(`${label}: invalid operation record ${JSON.stringify(record)}`);
    if (keys.has(key)) duplicates.push(key);
    if (!isPublicOperation(record)) continue;
    keys.add(key);
  }
  if (duplicates.length) throw new Error(`${label}: duplicate operation(s): ${duplicates.join(", ")}`);
  return keys;
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
  ["public catalog/allowlist", allowlistKeys(read(catalogPath))],
  ["rendered operation inventory", recordsKeys(read(renderedPath), "rendered inventory")],
]);
const [firstLabel, first] = sets.entries().next().value;
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
console.log(`Cross-repository operation parity passed: ${first.size} exact method/path identities across ${sets.size} artifacts`);
