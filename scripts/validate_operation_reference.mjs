#!/usr/bin/env node

/** Validate the minimum metadata contract required by generated API references. */
import fs from "node:fs";
import pathModule from "node:path";

const input = process.argv[2] ?? "openapi/sec-api-public.v1.json";
const catalogPath = process.argv[3];
if (!catalogPath) {
  console.error("Usage: validate_operation_reference.mjs <openapi.json> <pinned-public-operation-catalog.json> [evidence.json]");
  process.exit(2);
}
const document = JSON.parse(fs.readFileSync(input, "utf8"));
const root = process.cwd();
const paths = document.paths ?? {};
const failures = [];
let operations = 0;
const publicMethods = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);
const catalogByKey = new Map();

for (const [path, item] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!publicMethods.has(method)) continue;
    operations += 1;
    const extension = operation["x-turos"];
    const label = `${method.toUpperCase()} ${path}`;
    if (!operation.summary?.trim()) failures.push(`${label}: missing summary`);
    if (!operation.description?.trim()) failures.push(`${label}: missing description`);
    if (!Array.isArray(operation.tags) || operation.tags.length === 0) failures.push(`${label}: missing OpenAPI tag`);
    if (!extension || typeof extension !== "object") {
      failures.push(`${label}: missing x-turos metadata`);
      continue;
    }
    for (const field of ["domain", "availability", "access", "meterClass", "sourceFields", "freshnessFields"]) {
      if (!(field in extension)) failures.push(`${label}: missing x-turos.${field}`);
    }
  }
}

if (catalogPath) {
  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const records = Array.isArray(catalog) ? catalog : catalog.operations;
  if (!Array.isArray(records)) failures.push("catalog: expected an operations array");
  else {
    for (const record of records) {
      const method = String(record.method ?? "").toLowerCase();
      const path = String(record.path ?? "");
      const key = `${method.toUpperCase()} ${path}`;
      if (!publicMethods.has(method) || !path) failures.push(`${key}: invalid public operation key`);
      if (catalogByKey.has(key)) failures.push(`${key}: duplicate catalog operation`);
      catalogByKey.set(key, record);
      for (const field of ["tag", "docsPath", "summary", "description", "availability", "access", "meterClass", "sourceFields", "freshnessFields", "workflows", "inputs", "examples", "responseFields"]) {
        if (!(field in record)) failures.push(`${key}: missing catalog.${field}`);
      }
      if (typeof record.docsPath !== "string" || !record.docsPath.trim()) failures.push(`${key}: docsPath must be a non-empty string`);
      else {
        const docsPath = record.docsPath.replaceAll("\\", "/");
        if (docsPath.startsWith("/") || docsPath.includes("..") || !docsPath.startsWith("api-reference/")) failures.push(`${key}: docsPath must be a safe path under api-reference/`);
        validatePath(record.docsPath, pathModule.resolve(root, "api-reference"), `${key}: docsPath`, failures);
      }
      if (record.workflows !== undefined && !Array.isArray(record.workflows)) failures.push(`${key}: workflows must be an array`);
      for (const field of ["inputs", "examples", "responseFields"]) if (record[field] !== undefined && !Array.isArray(record[field]) && typeof record[field] !== "object") failures.push(`${key}: ${field} must be an array or object`);
    }
    for (const [key, operation] of catalogByKey) {
      const [method, ...pathParts] = key.split(" ");
      const path = pathParts.join(" ");
      if (!document.paths?.[path]?.[method.toLowerCase()]) failures.push(`${key}: catalog operation absent from OpenAPI`);
      const metadata = document.paths?.[path]?.[method.toLowerCase()]?.["x-turos"];
      if (!metadata) failures.push(`${key}: OpenAPI operation missing x-turos metadata`);
      else for (const field of ["domain", "availability", "access", "meterClass", "sourceFields", "freshnessFields"]) if (recordValue(metadata, field) && JSON.stringify(metadata[field]) !== JSON.stringify(operation[field])) failures.push(`${key}: ${field} differs between catalog and OpenAPI`);
    }
    const openapiKeys = new Set();
    for (const [path, item] of Object.entries(paths)) for (const method of Object.keys(item)) if (publicMethods.has(method)) openapiKeys.add(`${method.toUpperCase()} ${path}`);
    for (const key of openapiKeys) if (!catalogByKey.has(key)) failures.push(`${key}: public OpenAPI operation absent from catalog`);
    if (catalog.llmsPath !== undefined) {
      if (typeof catalog.llmsPath !== "string" || !catalog.llmsPath.trim()) failures.push("catalog.llmsPath must be a non-empty string");
      else validatePath(catalog.llmsPath, root, "catalog.llmsPath", failures);
    }
    if (catalog.discoveryPaths !== undefined) {
      if (!Array.isArray(catalog.discoveryPaths)) failures.push("catalog.discoveryPaths must be an array");
      else for (const discoveryPath of catalog.discoveryPaths) {
        if (typeof discoveryPath !== "string" || !discoveryPath.trim()) failures.push("catalog.discoveryPaths contains an empty or non-string path");
        else validatePath(discoveryPath, root, "catalog discovery output", failures);
      }
    }
  }
}

if (failures.length) {
  console.error(`Operation reference contract failed for ${failures.length} field(s):`);
  console.error(failures.slice(0, 40).join("\n"));
  if (failures.length > 40) console.error(`…and ${failures.length - 40} more`);
  process.exit(1);
}

console.log(`Operation reference contract passed: ${operations} operations`);
if (process.argv[4]) {
  const evidence = JSON.stringify({ input, catalogPath, openapiOperationCount: operations, catalogOperationCount: catalogByKey.size, parity: operations === catalogByKey.size ? "pass" : "fail" }, null, 2) + "\n";
  const temporary = `${process.argv[4]}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, evidence, "utf8");
  fs.renameSync(temporary, process.argv[4]);
  console.log(`Parity evidence written atomically: ${process.argv[4]}`);
}

function recordValue(record, field) {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function validatePath(value, allowedRoot, label, failures) {
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || pathModule.isAbsolute(value) || normalized.split("/").includes("..")) {
    failures.push(`${label} must be a relative path without traversal: ${value}`);
    return;
  }
  const candidate = pathModule.resolve(root, value);
  const lexicalRoot = pathModule.resolve(allowedRoot);
  if (candidate !== lexicalRoot && !candidate.startsWith(`${lexicalRoot}${pathModule.sep}`)) {
    failures.push(`${label} escapes its allowed root: ${value}`);
    return;
  }
  if (!fs.existsSync(candidate)) {
    failures.push(`${label} does not exist: ${value}`);
    return;
  }
  let realCandidate;
  let realRoot;
  try {
    realCandidate = fs.realpathSync(candidate);
    realRoot = fs.realpathSync(lexicalRoot);
  } catch {
    failures.push(`${label} cannot be resolved: ${value}`);
    return;
  }
  if (realCandidate !== realRoot && !realCandidate.startsWith(`${realRoot}${pathModule.sep}`)) failures.push(`${label} escapes its allowed root through a symlink: ${value}`);
}
