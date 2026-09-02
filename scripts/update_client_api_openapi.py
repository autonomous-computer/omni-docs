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


DEFAULT_SOURCE_URL = "https://api.turos.app/openapi.json"
DEFAULT_BASE_URL = "https://api.turos.app"
DEFAULT_OUT_PATH = Path("openapi/omni-client-api.v1.json")
# Routes that only the OMNI Client API serves. Used as an identity gate so a
# redirect to some other API cannot silently replace the snapshot.
DEFAULT_SENTINEL_PATHS = ("/v1/fred/search", "/v1/mcp/tools", "/mcp", "/sse")


class OpenApiFetchError(RuntimeError):
    """Raised when the upstream OpenAPI contract cannot be retrieved or parsed."""


class OpenApiIdentityError(RuntimeError):
    """Raised when the fetched document is not the OMNI Client API contract."""


def _parse_json(text: str, source_url: str, how: str) -> Dict[str, Any]:
    if not text.strip():
        raise OpenApiFetchError(
            f"{source_url} returned an empty body via {how}. "
            "The upstream OpenAPI contract is unreachable; refusing to write a snapshot."
        )
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        preview = text[:200].replace("\n", " ")
        raise OpenApiFetchError(
            f"{source_url} did not return JSON via {how} ({exc}). First 200 bytes: {preview!r}"
        ) from exc


def _fetch_json(source_url: str, timeout_seconds: int) -> Dict[str, Any]:
    urllib_error: str | None = None
    try:
        req = urllib.request.Request(
            source_url,
            headers={"Accept": "application/json", "User-Agent": "omni-docs-openapi-refresh/1"},
        )
        # urllib follows 301/302/303/307/308 for GET by default.
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            return _parse_json(resp.read().decode("utf-8"), source_url, "urllib")
    except OpenApiFetchError:
        raise
    except Exception as exc:  # noqa: BLE001 - fall back to curl, but remember why.
        urllib_error = f"{type(exc).__name__}: {exc}"

    # Fallback to curl (useful for local environments with broken cert stores).
    # -L is REQUIRED: the upstream host answers 308 and without it curl writes an
    # empty body, which used to surface as a bare JSONDecodeError.
    # --fail turns an HTTP error status into a non-zero exit instead of a body.
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        try:
            subprocess.run(
                ["curl", "-sS", "-L", "--fail", source_url, "-o", tmp_path],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
            )
        except FileNotFoundError as exc:
            raise OpenApiFetchError(
                f"Could not fetch {source_url}: urllib failed ({urllib_error}) and curl is not installed."
            ) from exc
        except subprocess.CalledProcessError as exc:
            raise OpenApiFetchError(
                f"Could not fetch {source_url}: urllib failed ({urllib_error}) and "
                f"curl exited {exc.returncode}: {(exc.stderr or '').strip()}"
            ) from exc
        with open(tmp_path, "r", encoding="utf-8") as handle:
            return _parse_json(handle.read(), source_url, "curl")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _assert_client_api_identity(raw: Dict[str, Any], source_url: str, sentinels: set[str]) -> None:
    """Refuse to overwrite the snapshot with a document from a different API.

    `https://api.turos.app/openapi.json` now 308-redirects to the SEC public
    spec. That document also has `/v1/*` routes, so without this gate the
    generator would happily filter it, relabel it "OMNI Client API" and commit an
    unrelated contract. Silently writing the wrong API is worse than crashing.
    """
    paths = raw.get("paths")
    if not isinstance(paths, dict):
        raise OpenApiIdentityError(f"{source_url}: OpenAPI payload missing object 'paths'.")
    missing = sorted(s for s in sentinels if s not in paths)
    if missing:
        title = (raw.get("info") or {}).get("title") if isinstance(raw.get("info"), dict) else None
        raise OpenApiIdentityError(
            f"{source_url} does not look like the OMNI Client API contract "
            f"(info.title={title!r}, {len(paths)} paths). Missing required routes: "
            f"{', '.join(missing)}. Refusing to overwrite the committed snapshot."
        )


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

    # These schemas are FastAPI framework noise and become orphaned once the
    # default 422 responses are removed.
    components = spec.get("components")
    if isinstance(components, dict):
        schemas = components.get("schemas")
        if isinstance(schemas, dict):
            schemas.pop("HTTPValidationError", None)
            schemas.pop("ValidationError", None)


def main() -> int:
    parser = argparse.ArgumentParser(description="Update OMNI Client API OpenAPI snapshot for docs.")
    parser.add_argument("--source-url", default=DEFAULT_SOURCE_URL)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--out", default=str(DEFAULT_OUT_PATH))
    parser.add_argument("--timeout-seconds", type=int, default=30)
    parser.add_argument(
        "--sentinel-path",
        action="append",
        default=None,
        help="Route that must exist in the fetched spec (repeatable). Identity gate.",
    )
    args = parser.parse_args()

    raw = _fetch_json(args.source_url, timeout_seconds=args.timeout_seconds)
    if not isinstance(raw, dict):
        raise OpenApiFetchError(f"{args.source_url}: OpenAPI payload must be a JSON object.")

    sentinels = set(args.sentinel_path or DEFAULT_SENTINEL_PATHS)
    _assert_client_api_identity(raw, args.source_url, sentinels)

    paths = raw["paths"]

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
    try:
        raise SystemExit(main())
    except (OpenApiFetchError, OpenApiIdentityError) as exc:
        print(f"[openapi] ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
