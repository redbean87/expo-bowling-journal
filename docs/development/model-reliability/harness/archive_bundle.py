#!/usr/bin/env python3
"""Durable archival bundling for model-reliability evaluation artifacts.

Evaluation runs produce large, volatile artifacts under the OS temporary
directory. This module copies the retention-relevant artifacts into a durable,
non-versioned archive bundle and records a per-file SHA-256 manifest, so a
completed evaluation no longer depends on a purgeable ``/var/folders/.../T/``
workspace.

Two operations:

* ``build``  -- read a JSON *spec* that maps volatile source paths to bundle
  relative paths, copy the files byte-for-byte into the bundle, and write a
  manifest recording size + SHA-256 and provenance for every archived file. It
  never modifies the sources.
* ``verify`` -- read a manifest and confirm the bundle still matches it
  (per-file size + SHA-256, plus missing/unexpected-file detection) without
  mutating anything.

The bundle itself is intentionally not committed to Git (raw traces and
``results.jsonl`` files are large); the committed manifest + spec + this script
are the repository-controlled mechanism. See
``docs/development/model-reliability/ARCHIVE.md``.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harness_lib as H  # noqa: E402


def resolve_location(path: Path) -> Path:
    """Resolve a (possibly relative) archive path against the repository root."""
    path = Path(path).expanduser()
    return path if path.is_absolute() else (H.REPO_ROOT / path)


def _tree_files(root: Path, includes) -> list:
    files = []
    for pattern in includes:
        for candidate in sorted(root.glob(pattern)):
            if candidate.is_file():
                files.append(candidate)
    return files


def collect_files(spec: dict) -> list:
    """Return ``(source_path, bundle_relative_path)`` pairs described by a spec."""
    pairs = []
    for tree in spec.get("trees", []):
        root = Path(tree["root"]).expanduser()
        if not root.is_dir():
            raise H.HarnessError(f"archive source root not found: {root}")
        dest = Path(tree["dest"])
        for src in _tree_files(root, tree.get("include", [])):
            pairs.append((src, dest / src.relative_to(root)))
    for entry in spec.get("files", []):
        pairs.append((Path(entry["src"]).expanduser(), Path(entry["dest"])))
    # deterministic order; reject duplicate destinations
    pairs.sort(key=lambda pair: pair[1].as_posix())
    seen = set()
    for _, rel in pairs:
        if rel.as_posix() in seen:
            raise H.HarnessError(f"duplicate archive destination: {rel}")
        seen.add(rel.as_posix())
    return pairs


def build(spec_path: Path, manifest_path: Path, dest: Path | None = None) -> dict:
    """Copy a spec's sources into the bundle and write the hash manifest."""
    spec_path = resolve_location(spec_path)
    spec = H.read_json(spec_path)
    bundle = resolve_location(dest if dest is not None else spec["dest"])
    bundle.mkdir(parents=True, exist_ok=True)

    entries = []
    for src, rel in collect_files(spec):
        if not src.is_file():
            raise H.HarnessError(f"archive source file not found: {src}")
        data = src.read_bytes()
        target = bundle / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        entries.append({
            "dest": rel.as_posix(),
            "src": str(src),
            "bytes": len(data),
            "sha256": H.sha256_bytes(data),
        })

    manifest = {
        "archive_id": spec.get("archive_id"),
        "description": spec.get("description"),
        "generated_at": H.now_iso(),
        "archive_location": str(bundle),
        "spec": str(spec_path),
        "provenance": spec.get("provenance", {}),
        "original_volatile_roots": spec.get("original_volatile_roots", []),
        "file_count": len(entries),
        "total_bytes": sum(e["bytes"] for e in entries),
        "files": entries,
    }
    H.write_json(manifest_path, manifest)
    print(f"archived {len(entries)} files ({manifest['total_bytes']} bytes) to {bundle}")
    print(f"wrote manifest {manifest_path}")
    return manifest


def verify(manifest_path: Path, dest: Path | None = None) -> dict:
    """Verify a bundle against its manifest without modifying anything."""
    manifest_path = resolve_location(manifest_path)
    manifest = H.read_json(manifest_path)
    bundle = resolve_location(dest if dest is not None else manifest["archive_location"])

    issues = []
    checked = 0
    total_bytes = 0
    if not bundle.is_dir():
        return {
            "manifest": str(manifest_path),
            "archive_location": str(bundle),
            "exists": False,
            "checked": 0,
            "issues": [f"archive bundle not found: {bundle}"],
            "ok": False,
        }

    listed = set()
    for entry in manifest["files"]:
        dest_rel = entry["dest"]
        listed.add(dest_rel)
        target = bundle / dest_rel
        if not target.is_file():
            issues.append(f"missing file: {dest_rel}")
            continue
        data = target.read_bytes()
        checked += 1
        total_bytes += len(data)
        if len(data) != entry["bytes"]:
            issues.append(
                f"size mismatch: {dest_rel} ({len(data)} != {entry['bytes']})")
        sha = H.sha256_bytes(data)
        if sha != entry["sha256"]:
            issues.append(
                f"sha256 mismatch: {dest_rel} ({sha} != {entry['sha256']})")

    on_disk = {p.relative_to(bundle).as_posix()
               for p in bundle.rglob("*") if p.is_file()}
    unexpected = sorted(on_disk - listed)
    if unexpected:
        issues.append(f"{len(unexpected)} unexpected file(s): {unexpected[:10]}")

    report = {
        "manifest": str(manifest_path),
        "archive_id": manifest.get("archive_id"),
        "archive_location": str(bundle),
        "exists": True,
        "file_count": manifest.get("file_count"),
        "checked": checked,
        "total_bytes": total_bytes,
        "issues": issues,
        "ok": not issues,
    }
    return report


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)

    b = sub.add_parser("build", help="copy a spec's sources into the bundle")
    b.add_argument("--spec", required=True, type=Path)
    b.add_argument("--manifest", required=True, type=Path)
    b.add_argument("--dest", type=Path, default=None,
                   help="override the bundle location (default: the spec's dest)")

    v = sub.add_parser("verify", help="verify a bundle against its manifest")
    v.add_argument("--manifest", required=True, type=Path)
    v.add_argument("--dest", type=Path, default=None,
                   help="override the bundle location (default: manifest archive_location)")
    v.add_argument("--json", action="store_true", help="emit a JSON report")

    args = p.parse_args(argv)
    try:
        if args.command == "build":
            build(args.spec, args.manifest, args.dest)
            return 0
        report = verify(args.manifest, args.dest)
        if args.json:
            print(json.dumps(report, indent=2))
        else:
            if report["ok"]:
                print(f"OK: {report['checked']}/{report['file_count']} files verified "
                      f"({report['total_bytes']} bytes) at {report['archive_location']}")
            else:
                print(f"FAILED: {len(report['issues'])} issue(s) at "
                      f"{report['archive_location']}", file=sys.stderr)
                for issue in report["issues"]:
                    print(f"  - {issue}", file=sys.stderr)
        return 0 if report["ok"] else 1
    except H.HarnessError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
