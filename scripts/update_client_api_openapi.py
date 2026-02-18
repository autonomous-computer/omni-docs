#!/usr/bin/env python3
"""Refresh the checked-in OpenAPI snapshot for the OMNI Client API docs.

This script downloads the production FastAPI OpenAPI contract and filters it to:
- `/v1/*` Client API routes
- `/mcp` and `/sse` hosted MCP transports

It then normalizes metadata (info.title, servers) and writes:
  openapi/omni-client-api.v1.json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict


DEFAULT_SOURCE_URL = "https://api.omnibrief.app/openapi.json"
DEFAULT_BASE_URL = "https://api.omnibrief.app"
DEFAULT_OUT_PATH = Path("openapi/omni-client-api.v1.json")


def _fetch_json(source_url: str, timeout_seconds: int) -> Dict[str, Any]:
    try:
        req = urllib.request.Request(source_url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        # Fallback to curl (useful for local environments with broken cert stores).
        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            subprocess.run(
                ["curl", "-sS", source_url, "-o", tmp_path],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
            )
            with open(tmp_path, "r", encoding="utf-8") as handle:
                return json.load(handle)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def _filter_paths(paths: Dict[str, Any]) -> Dict[str, Any]:
    keep: Dict[str, Any] = {}
    for path, spec in paths.items():
        if path.startswith("/v1/") or path in {"/mcp", "/sse"}:
            keep[path] = spec
    return keep


def _strip_fastapi_validation_errors(spec: Dict[str, Any]) -> None:
    """Remove FastAPI's default 422 Validation Error responses from the snapshot.

    OMNI Client API standardizes on ClientApiErrorEnvelope for 4xx/5xx failures.
    FastAPI automatically adds 422 responses for request validation, which leaks
    framework-specific schema into the public contract and confuses consumers.
    """

    def _is_fastapi_validation_422(resp: Any) -> bool:
        if not isinstance(resp, dict):
            return False
        content = resp.get("content")
        if not isinstance(content, dict):
            return False
        app_json = content.get("application/json")
        if not isinstance(app_json, dict):
            return False
        schema = app_json.get("schema")
        if not isinstance(schema, dict):
            return False
        return schema.get("$ref") == "#/components/schemas/HTTPValidationError"

    paths = spec.get("paths")
    if not isinstance(paths, dict):
        return

    http_methods = {"get", "post", "put", "patch", "delete", "head", "options"}
    for _path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, op in path_item.items():
            if method not in http_methods or not isinstance(op, dict):
                continue
            responses = op.get("responses")
            if not isinstance(responses, dict) or "422" not in responses:
                continue
            if _is_fastapi_validation_422(responses.get("422")):
                responses.pop("422", None)


def main() -> int:
    parser = argparse.ArgumentParser(description="Update OMNI Client API OpenAPI snapshot for docs.")
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--out", default=str(DEFAULT_OUT_PATH))
    parser.add_argument("--timeout-seconds", type=int, default=30)
    args = parser.parse_args()

    raw = _fetch_json(args.source_url, timeout_seconds=args.timeout_seconds)
    if not isinstance(raw, dict):
        raise SystemExit("OpenAPI payload must be a JSON object.")

    paths = raw.get("paths", {})
    if not isinstance(paths, dict):
        raise SystemExit("OpenAPI payload missing object 'paths'.")

    raw["paths"] = _filter_paths(paths)

    info = raw.get("info") if isinstance(raw.get("info"), dict) else {}
    info["title"] = "OMNI Client API"
    info.setdefault("version", "v1")
    info.setdefault("description", "OMNI Client API and hosted MCP transport.")
    raw["info"] = info

    servers = raw.get("servers")
    if not isinstance(servers, list):
        servers = []
    prod = {"url": args.base_url.rstrip("/"), "description": "Production"}
    raw["servers"] = [prod] + [s for s in servers if isinstance(s, dict) and s.get("url") != prod["url"]]

    # Mark auth as required across the contract so generated reference pages
    # (Mintlify OpenAPI) correctly show Authorization headers.
    components = raw.get("components")
    if isinstance(components, dict):
        schemes = components.get("securitySchemes")
        if isinstance(schemes, dict) and "HTTPBearer" in schemes:
            raw["security"] = [{"HTTPBearer": []}]

    _strip_fastapi_validation_errors(raw)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(raw, handle, indent=2, sort_keys=False)
        handle.write("\n")

    print(f"[openapi] wrote {out_path} paths={len(raw['paths'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
