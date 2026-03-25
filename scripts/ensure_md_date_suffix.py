#!/usr/bin/env python3
"""
Ensure staged Markdown filenames use -YYMMDD suffix.

Behavior:
- Targets only staged .md files (added/copied/modified/renamed).
- Renames files to <base>-YYMMDD.md using local current date.
- Updates references in common text files across repo.
- Re-stages all changes so commit includes renames/reference updates.
"""

from __future__ import annotations

import datetime as dt
import os
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SUFFIX_RE = re.compile(r"-(\d{6})$")
TEXT_EXTS = {".md", ".js", ".ts", ".tsx", ".jsx", ".html", ".json", ".txt", ".yml", ".yaml"}


def run(cmd: list[str]) -> str:
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip())
    return (p.stdout or "").strip()


def staged_markdown_paths() -> list[Path]:
    out = run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    files = [line.strip() for line in out.splitlines() if line.strip().endswith(".md")]
    paths: list[Path] = []
    for rel in files:
        p = ROOT / rel
        if p.exists() and p.is_file():
            paths.append(p)
    return paths


def target_name(p: Path, yymmdd: str) -> Path:
    stem = SUFFIX_RE.sub("", p.stem)
    return p.with_name(f"{stem}-{yymmdd}.md")


def replace_refs(rename_map: dict[Path, Path]) -> int:
    changed = 0
    all_files = [p for p in ROOT.rglob("*") if p.is_file() and p.suffix.lower() in TEXT_EXTS]
    for f in all_files:
        try:
            s = f.read_text(encoding="utf-8")
        except Exception:
            continue
        orig = s
        for old, new in rename_map.items():
            old_rel = old.relative_to(ROOT).as_posix()
            new_rel = new.relative_to(ROOT).as_posix()
            s = s.replace(old_rel, new_rel)
            s = s.replace(old.name, new.name)
        if s != orig:
            f.write_text(s, encoding="utf-8")
            changed += 1
    return changed


def main() -> int:
    yymmdd = dt.datetime.now().strftime("%y%m%d")
    md_paths = staged_markdown_paths()
    if not md_paths:
        return 0

    rename_map: dict[Path, Path] = {}
    for old in md_paths:
        new = target_name(old, yymmdd)
        if new == old:
            continue
        if new.exists() and new not in rename_map.values():
            print(f"[md-date] skip (target exists): {old.relative_to(ROOT)} -> {new.relative_to(ROOT)}")
            continue
        rename_map[old] = new

    for old, new in rename_map.items():
        os.rename(old, new)
        print(f"[md-date] renamed: {old.relative_to(ROOT)} -> {new.relative_to(ROOT)}")

    if rename_map:
        touched = replace_refs(rename_map)
        print(f"[md-date] updated refs in {touched} files")
        subprocess.run(["git", "add", "-A"], cwd=ROOT, check=False)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

