#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Block commits containing mojibake (UTF-8 read as CP949 corruption).

Signatures of that corruption (260731 incident, play-test.html/admin-trajectory.js):
  1. CJK ideographs (hanja) directly adjacent to hangul in one word — this
     codebase never uses hanja, but the corruption always produces it
     (e.g. 기억 -> 湲곗뼲).
  2. C1 control characters (U+0080-U+009F) — byte 0x80 passed through raw.

Scans staged files (pre-commit) or paths given as arguments.
"""
import re
import subprocess
import sys

SIG_HANJA_HANGUL = re.compile(r"[一-鿿][가-힣]|[가-힣][一-鿿]")
SIG_C1_CONTROL = re.compile("[\u0080-\u009f]")
EXTS = (".html", ".js", ".mjs", ".cjs", ".css", ".md", ".json")

def staged_files():
    out = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
        capture_output=True, text=True, check=True).stdout
    return [f for f in out.split("\n") if f.endswith(EXTS)]

def scan(path):
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except (OSError, UnicodeDecodeError):
        return []
    hits = []
    for i, line in enumerate(text.split("\n"), 1):
        if SIG_HANJA_HANGUL.search(line) or SIG_C1_CONTROL.search(line):
            hits.append((i, line.strip()[:80]))
    return hits

def main():
    paths = sys.argv[1:] or staged_files()
    bad = False
    for p in paths:
        hits = scan(p)
        if hits:
            bad = True
            print(f"[mojibake] {p}: {len(hits)} suspicious line(s)")
            for ln, preview in hits[:5]:
                print(f"  L{ln}: {preview}")
    if bad:
        print("\n[mojibake] 인코딩 깨짐 신호가 감지되었습니다. 파일을 UTF-8로 다시 확인하세요.")
        print("[mojibake] 정말 의도한 내용이면 SKIP_MOJIBAKE=1 git commit ... 으로 우회할 수 있습니다.")
        return 1
    return 0

if __name__ == "__main__":
    import os
    if os.environ.get("SKIP_MOJIBAKE") == "1":
        sys.exit(0)
    sys.exit(main())
