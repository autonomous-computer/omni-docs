#!/usr/bin/env python3
"""Guard: every .github/workflows/*.yml parses under a STRICT YAML loader.

`yaml.safe_load` silently accepts duplicate mapping keys (last one wins), but
GitHub Actions refuses to start a workflow whose YAML has a duplicate key. The
result is a zero-job "failure" run that looks like CI ran and did nothing.

This loader rejects duplicate keys. It also asserts a small set of repo policies
that are easy to regress:

  * no `on: push:` trigger (this repo ships via PR + schedule only)
  * every `needs:` names a job that exists in the same workflow
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml


class StrictLoader(yaml.SafeLoader):
    pass


def _no_duplicate_keys(loader: yaml.Loader, node: yaml.MappingNode, deep: bool = False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise yaml.constructor.ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                f"found duplicate key {key!r}",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


StrictLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _no_duplicate_keys)


def check(path: Path) -> list[str]:
    failures: list[str] = []
    try:
        doc = yaml.load(path.read_text(encoding="utf-8"), Loader=StrictLoader)
    except yaml.YAMLError as exc:
        return [f"{path}: YAML error: {str(exc).strip()}"]

    if not isinstance(doc, dict):
        return [f"{path}: workflow must be a mapping"]

    # PyYAML resolves an unquoted bare `on:` key to the boolean True.
    triggers = doc.get("on", doc.get(True))
    if triggers is None:
        failures.append(f"{path}: workflow has no `on:` triggers")
    elif isinstance(triggers, dict) and "push" in triggers:
        failures.append(
            f"{path}: `on: push:` is not allowed in this repo - use `pull_request:` "
            "or `schedule:` instead"
        )
    elif triggers == "push" or (isinstance(triggers, list) and "push" in triggers):
        failures.append(f"{path}: `on: push` is not allowed in this repo")

    jobs = doc.get("jobs")
    if not isinstance(jobs, dict) or not jobs:
        failures.append(f"{path}: workflow declares no jobs")
        return failures

    for job_id, job in jobs.items():
        if not isinstance(job, dict):
            failures.append(f"{path}: job {job_id} is not a mapping")
            continue
        needs = job.get("needs")
        if needs is None:
            continue
        needs_list = [needs] if isinstance(needs, str) else needs
        if not isinstance(needs_list, list):
            failures.append(f"{path}: job {job_id} has a malformed `needs:`")
            continue
        for dep in needs_list:
            if dep not in jobs:
                failures.append(f"{path}: job {job_id} needs undefined job {dep!r}")
    return failures


def main() -> int:
    root = Path(".github/workflows")
    files = sorted(list(root.glob("*.yml")) + list(root.glob("*.yaml")))
    if not files:
        print(f"[workflows] no workflow files under {root}; refusing to pass vacuously", file=sys.stderr)
        return 1

    failures: list[str] = []
    for path in files:
        failures.extend(check(path))

    print(f"[workflows] checked {len(files)} workflow file(s)")
    if failures:
        print(f"[workflows] {len(failures)} failure(s):", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1
    print("[workflows] OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
