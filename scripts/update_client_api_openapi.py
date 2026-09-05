#!/usr/bin/env python3
"""Refresh the checked-in OpenAPI snapshot for the OMNI Client API docs.

This script downloads the production FastAPI OpenAPI contract and filters it to:
- `/v1/*` Client API routes
- `/mcp` hosted MCP transport
- documented legacy compatibility routes that are still live but not present in
  the public SEC API OpenAPI source

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


DEFAULT_SOURCE_URL = "openapi/sec-api-public.v1.json"
DEFAULT_BASE_URL = "https://api.turos.app"
DEFAULT_OUT_PATH = Path("openapi/omni-client-api.v1.json")
# Routes that the SEC API public contract must expose before the local
# compatibility overlay is applied. Used as an identity gate so a redirect or
# empty shell cannot silently replace the snapshot.
DEFAULT_SENTINEL_PATHS = ("/v1/entities/resolve", "/v1/filings", "/v1/billing/rates", "/mcp")


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

LEGACY_COMPATIBILITY_SCHEMAS: Dict[str, Any] = {
    "ClientApiErrorDetail": {
        "properties": {
            "type": {
                "type": "string",
                "enum": [
                    "invalid_request",
                    "auth_error",
                    "permission_error",
                    "rate_limit_error",
                    "api_error",
                ],
                "title": "Type",
            },
            "code": {"type": "string", "title": "Code"},
            "message": {"type": "string", "title": "Message"},
            "request_id": {"type": "string", "title": "Request Id"},
        },
        "type": "object",
        "required": ["type", "code", "message", "request_id"],
        "title": "ClientApiErrorDetail",
    },
    "ClientApiErrorEnvelope": {
        "properties": {"error": {"$ref": "#/components/schemas/ClientApiErrorDetail"}},
        "type": "object",
        "required": ["error"],
        "title": "ClientApiErrorEnvelope",
    },
    "ClientApiHealthResponse": {
        "properties": {
            "object": {"type": "string", "const": "health", "title": "Object"},
            "status": {"type": "string", "const": "ok", "title": "Status"},
            "request_id": {"type": "string", "title": "Request Id"},
            "mode": {"type": "string", "title": "Mode"},
        },
        "type": "object",
        "required": ["object", "status", "request_id", "mode"],
        "title": "ClientApiHealthResponse",
    },
    "ClientApiMcpInvokeResponse": {
        "properties": {
            "object": {"type": "string", "const": "mcp.tool_result", "title": "Object"},
            "tool": {"type": "string", "title": "Tool"},
            "data": {"additionalProperties": True, "type": "object", "title": "Data"},
        },
        "type": "object",
        "required": ["object", "tool", "data"],
        "title": "ClientApiMcpInvokeResponse",
    },
    "ClientApiTool": {
        "properties": {
            "id": {"type": "string", "title": "Id"},
            "name": {"type": "string", "title": "Name"},
            "method": {"type": "string", "title": "Method"},
            "path": {"type": "string", "title": "Path"},
            "description": {"type": "string", "title": "Description"},
        },
        "type": "object",
        "required": ["id", "name", "method", "path", "description"],
        "title": "ClientApiTool",
    },
    "ClientApiToolListResponse": {
        "properties": {
            "object": {"type": "string", "const": "list", "title": "Object"},
            "data": {
                "items": {"$ref": "#/components/schemas/ClientApiTool"},
                "type": "array",
                "title": "Data",
            },
        },
        "type": "object",
        "required": ["object", "data"],
        "title": "ClientApiToolListResponse",
    },
}

LEGACY_ERROR_RESPONSES: Dict[str, Any] = {
    status: {
        "description": description,
        "content": {
            "application/json": {
                "schema": {"$ref": "#/components/schemas/ClientApiErrorEnvelope"}
            }
        },
    }
    for status, description in {
        "401": "Unauthorized",
        "403": "Forbidden",
        "429": "Too Many Requests",
        "503": "Service Unavailable",
    }.items()
}

LEGACY_COMPATIBILITY_PATHS: Dict[str, Any] = {
    "/v1/openapi.json": {
        "get": {
            "tags": ["client-api"],
            "summary": "OpenAPI (v1 subset)",
            "description": "Returns the OpenAPI contract filtered to Client API and hosted MCP routes.",
            "operationId": "client_api_openapi_v1_openapi_json_get",
            "responses": {
                "200": {
                    "description": "Successful Response",
                    "content": {
                        "application/json": {
                            "schema": {
                                "additionalProperties": True,
                                "type": "object",
                                "title": "Response Client Api Openapi V1 Openapi Json Get",
                            }
                        }
                    },
                },
                "400": {
                    "description": "Bad Request",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/ClientApiErrorEnvelope"}
                        }
                    },
                },
                **LEGACY_ERROR_RESPONSES,
            },
        }
    },
    "/v1/health": {
        "get": {
            "tags": ["client-api"],
            "summary": "Health check",
            "description": "Authenticates the API key and returns a minimal health payload.",
            "operationId": "client_api_health_v1_health_get",
            "responses": {
                "200": {
                    "description": "Successful Response",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/ClientApiHealthResponse"}
                        }
                    },
                },
                **LEGACY_ERROR_RESPONSES,
            },
        }
    },
    "/v1/mcp/tools": {
        "get": {
            "tags": ["client-api"],
            "summary": "List tools (legacy MCP-compatible surface)",
            "description": "Legacy MCP-compatible tool catalog. Prefer the hosted MCP transport at `/mcp` for new integrations.",
            "operationId": "client_api_mcp_tools_v1_mcp_tools_get",
            "deprecated": True,
            "responses": {
                "200": {
                    "description": "Successful Response",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/ClientApiToolListResponse"}
                        }
                    },
                },
                **LEGACY_ERROR_RESPONSES,
            },
        }
    },
    "/v1/mcp/invoke": {
        "post": {
            "tags": ["client-api"],
            "summary": "Invoke tool (legacy MCP-compatible surface)",
            "description": "Legacy tool invocation endpoint. Prefer the hosted MCP transport at `/mcp` for new integrations.",
            "operationId": "client_api_mcp_invoke_v1_mcp_invoke_post",
            "deprecated": True,
            "parameters": [
                {
                    "name": "Idempotency-Key",
                    "in": "header",
                    "required": True,
                    "schema": {"type": "string"},
                    "description": "Required for safe retries of tool invocations.",
                }
            ],
            "requestBody": {
                "required": True,
                "content": {
                    "application/json": {
                        "schema": {
                            "properties": {
                                "tool": {"title": "Tool", "type": "string"},
                                "arguments": {
                                    "additionalProperties": True,
                                    "title": "Arguments",
                                    "type": "object",
                                },
                            },
                            "required": ["tool"],
                            "title": "MCPInvokeRequest",
                            "type": "object",
                        }
                    }
                },
            },
            "responses": {
                "200": {
                    "description": "Successful Response",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/ClientApiMcpInvokeResponse"}
                        }
                    },
                },
                "400": {
                    "description": "Bad Request",
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/ClientApiErrorEnvelope"}
                        }
                    },
                },
                **LEGACY_ERROR_RESPONSES,
            },
        }
    },
    "/v1/sse": {
        "get": {
            "tags": ["client-api-mcp"],
            "summary": "Hosted MCP SSE compatibility endpoint",
            "description": "Compatibility endpoint for MCP clients expecting an SSE transport discovery flow. The primary hosted MCP endpoint is `POST /mcp`.",
            "operationId": "hosted_mcp_sse_compat_v1_sse_get",
            "responses": {
                "200": {
                    "description": "SSE stream advertising the primary MCP endpoint.",
                    "content": {
                        "application/json": {"schema": {}},
                        "text/event-stream": {"schema": {"type": "string"}},
                    },
                },
                **LEGACY_ERROR_RESPONSES,
            },
        }
    },
}


def _fetch_json(source_url: str, timeout_seconds: int) -> Dict[str, Any]:
    source_path = Path(source_url)
    if not source_path.is_absolute():
        repo_relative_source_path = Path(__file__).resolve().parents[1] / source_path
        if repo_relative_source_path.exists():
            source_path = repo_relative_source_path
    if source_path.exists():
        return _parse_json(source_path.read_text(encoding="utf-8"), source_url, "local file")

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

    The docs snapshot is generated from the SEC API public contract and then
    overlaid with documented compatibility routes. Without this gate the
    generator could follow a redirect to an unrelated JSON document, relabel it
    "OMNI Client API" and commit the wrong contract. Silently writing the wrong
    API is worse than crashing.
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
        if path.startswith("/v1/") or path == "/mcp":
            keep[path] = spec
    return keep


def _apply_legacy_compatibility_overlay(spec: Dict[str, Any]) -> None:
    """Preserve documented compatibility routes omitted by the public spec source."""

    paths = spec.setdefault("paths", {})
    if not isinstance(paths, dict):
        raise SystemExit("OpenAPI payload 'paths' must be an object before overlay.")
    paths.update(LEGACY_COMPATIBILITY_PATHS)

    components = spec.setdefault("components", {})
    if not isinstance(components, dict):
        raise SystemExit("OpenAPI payload 'components' must be an object before overlay.")
    schemas = components.setdefault("schemas", {})
    if not isinstance(schemas, dict):
        raise SystemExit("OpenAPI payload 'components.schemas' must be an object before overlay.")
    for name, schema in LEGACY_COMPATIBILITY_SCHEMAS.items():
        schemas.setdefault(name, schema)


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


def _normalize_security_to_api_key(spec: Dict[str, Any]) -> None:
    """Normalize the docs snapshot to the current x-api-key auth contract."""

    components = spec.get("components")
    if isinstance(components, dict):
        schemes = components.get("securitySchemes")
        if isinstance(schemes, dict):
            if "ApiKeyAuth" in schemes:
                schemes.pop("BearerAuth", None)
                spec["security"] = [{"ApiKeyAuth": []}]

    paths = spec.get("paths")
    if not isinstance(paths, dict):
        return

    http_methods = {"get", "post", "put", "patch", "delete", "head", "options"}
    for path_item in paths.values():
        if not isinstance(path_item, dict):
            continue
        for method, op in path_item.items():
            if method not in http_methods or not isinstance(op, dict):
                continue
            security = op.get("security")
            if not isinstance(security, list):
                continue
            normalized = []
            for requirement in security:
                if not isinstance(requirement, dict):
                    normalized.append(requirement)
                    continue
                if "BearerAuth" in requirement:
                    replacement = dict(requirement)
                    scopes = replacement.pop("BearerAuth")
                    replacement["ApiKeyAuth"] = scopes
                    normalized.append(replacement)
                else:
                    normalized.append(requirement)
            op["security"] = normalized


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

    _apply_legacy_compatibility_overlay(raw)

    _normalize_security_to_api_key(raw)

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
