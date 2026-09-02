#!/usr/bin/env python3
"""Guard: every OpenAPI operation has a docs.json navigation page, and vice versa.

Mintlify renders a generated reference page for an operation only when that
operation appears in `navigation` as a `"METHOD /path"` page string. An operation
that exists in the spec but has no nav entry is published nowhere; a nav entry
with no matching operation is a 404 in the sidebar.

Nothing else in this repo compares those two sets, so both drift silently. This
script is the comparison. It is network-free and deterministic.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterator

HTTP_METHODS = ("get", "post", "put", "patch", "delete", "head", "options")
OPERATION_PAGE = re.compile(r"^(%s) (/\S*)$" % "|".join(m.upper() for m in HTTP_METHODS))


def _iter_strings(node: Any) -> Iterator[str]:
    if isinstance(node, str):
        yield node
    elif isinstance(node, list):
        for item in node:
            yield from _iter_strings(item)
    elif isinstance(node, dict):
        for key, value in node.items():
            # `openapi` config blocks reference spec files, not nav pages.
            if key == "openapi":
                continue
            yield from _iter_strings(value)


def _openapi_sources(node: Any) -> Iterator[str]:
    if isinstance(node, list):
        for item in node:
            yield from _openapi_sources(item)
    elif isinstance(node, dict):
        for key, value in node.items():
            if key == "openapi":
                if isinstance(value, str):
                    yield value
                elif isinstance(value, dict) and isinstance(value.get("source"), str):
                    yield value["source"]
                elif isinstance(value, list):
                    for entry in value:
                        if isinstance(entry, str):
                            yield entry
                        elif isinstance(entry, dict) and isinstance(entry.get("source"), str):
                            yield entry["source"]
            else:
                yield from _openapi_sources(value)


def spec_operations(spec: dict) -> set[str]:
    paths = spec.get("paths")
    if not isinstance(paths, dict):
        raise SystemExit("spec: missing object 'paths'")
    ops: set[str] = set()
    for path, item in paths.items():
        if not isinstance(item, dict):
            raise SystemExit(f"spec: path item for {path} is not an object")
        for method in item:
            if method.lower() in HTTP_METHODS:
                ops.add(f"{method.upper()} {path}")
    return ops


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--docs-json", default="docs.json")
    parser.add_argument("--root", default=".")
    args = parser.parse_args()

    root = Path(args.root)
    docs = json.loads(Path(args.docs_json).read_text(encoding="utf-8"))
    navigation = docs.get("navigation")
    if not navigation:
        raise SystemExit(f"{args.docs_json}: missing 'navigation'")

    sources = sorted(set(_openapi_sources(docs)))
    if not sources:
        raise SystemExit(
            f"{args.docs_json}: no `openapi` source declared; nothing to check. "
            "This guard exists to compare nav against a spec - refusing to pass vacuously."
        )

    nav_ops = {s for s in _iter_strings(navigation) if OPERATION_PAGE.match(s)}
    if not nav_ops:
        raise SystemExit(
            f"{args.docs_json}: navigation contains zero 'METHOD /path' pages. "
            "Refusing to pass vacuously."
        )

    failures: list[str] = []
    all_spec_ops: set[str] = set()
    for source in sources:
        spec_path = root / source
        if not spec_path.is_file():
            failures.append(f"docs.json openapi source does not exist: {source}")
            continue
        all_spec_ops |= spec_operations(json.loads(spec_path.read_text(encoding="utf-8")))

    if not failures:
        for op in sorted(all_spec_ops - nav_ops):
            failures.append(f"operation in spec but absent from docs.json navigation: {op}")
        for op in sorted(nav_ops - all_spec_ops):
            failures.append(f"docs.json navigation page has no matching spec operation: {op}")

    print(
        f"[nav-coverage] sources={len(sources)} spec_operations={len(all_spec_ops)} "
        f"nav_operation_pages={len(nav_ops)}"
    )
    if failures:
        print(f"[nav-coverage] {len(failures)} failure(s):", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1
    print("[nav-coverage] OK: navigation and OpenAPI operations are 1:1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
