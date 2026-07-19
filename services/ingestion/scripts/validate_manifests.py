#!/usr/bin/env python
"""Validate every connector manifest against the JSON Schema and the Pydantic model.

Exit code 0 means all manifests are valid; non-zero prints the first failure.
Intended for CI (the license/contract stages) and local pre-commit use.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

from app.config import get_settings
from app.connectors.manifest import load_manifests

SCHEMA_PATH = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "schemas"
    / "connector-manifest.schema.json"
)


def main() -> int:
    settings = get_settings()
    manifest_dir = settings.connector_manifest_dir

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    errors = 0
    for path in sorted(manifest_dir.glob("*.yaml")):
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        schema_errors = sorted(validator.iter_errors(raw), key=lambda e: e.path)
        if schema_errors:
            errors += 1
            print(f"[schema] {path.name}:")
            for err in schema_errors:
                print(f"    - {list(err.path)}: {err.message}")

    # Pydantic model load also enforces cross-field rules and id uniqueness.
    try:
        manifests = load_manifests(manifest_dir)
    except Exception as exc:  # noqa: BLE001
        print(f"[model] {exc}")
        return 2

    if errors:
        return 1
    print(f"OK: {len(manifests)} manifests valid against schema and model.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
