// Convert plain-text mentions of vault documents ("docs/foo.md") into Obsidian wikilinks ([[foo]]).
// Usage: node linkify.mjs <docsDir> [--apply]
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2]);
const apply = process.argv.includes('--apply');

const SKIP_DIRS = new Set(['.obsidian', '_merged', '_print', '_print_merged', '.trash']);
// Files that must not be edited: pre-registration, frozen documents, submitted papers.
const isProtected = (rel) =>
  /사전등록|동결/.test(path.basename(rel)) || rel.split(path.sep)[0] === 'paper';

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out);
    } else if (e.name.toLowerCase().endsWith('.md')) out.push(path.join(dir, e.name));
  }
  return out;
}

const files = walk(root);
const byName = new Map();
for (const f of files) {
  const b = path.basename(f, '.md').normalize('NFC');
  byName.set(b, (byName.get(b) || 0) + 1);
}

// optional backtick, optional path prefix, basename, ".md", optional backtick
const RE = /(`?)((?:\.{1,2}\/)*(?:[^\s`()\[\]|<>"'*,:;]+\/)*)([^\s`()\[\]|<>"'*,:;\/]+)\.md(?![A-Za-z0-9])(`?)/g;

let totalRepl = 0, filesChanged = 0;
const skipped = { protectedFile: 0, notFound: 0, ambiguous: 0, self: 0, inLink: 0 };
const missing = new Map();
const samples = [];
const protectedList = [];

for (const f of files) {
  const rel = path.relative(root, f);
  const self = path.basename(f, '.md').normalize('NFC');
  const src = fs.readFileSync(f, 'utf8');
  const prot = isProtected(rel);
  if (prot) protectedList.push(rel);
  let inFence = false, n = 0;
  const lines = src.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    return line.replace(RE, (m, bt1, prefix, name, bt2, off) => {
      const key = name.normalize('NFC');
      const before = line.slice(0, off);
      const after = line.slice(off + m.length);
      // already a wikilink or the URL part of a markdown link
      if (/\[\[[^\]]*$/.test(before) || /\]\($/.test(before) || /\]\([^)]*$/.test(before)) { skipped.inLink++; return m; }
      if (bt1 !== bt2) return m; // inside a longer inline-code span
      if (!bt1 && (before.split('`').length % 2 === 0)) return m; // inside inline code with other text
      if (!byName.has(key)) { skipped.notFound++; missing.set(key, (missing.get(key) || 0) + 1); return m; }
      if (byName.get(key) > 1) { skipped.ambiguous++; return m; }
      if (key === self) { skipped.self++; return m; }
      if (prot) { skipped.protectedFile++; return m; }
      n++;
      if (samples.length < 12) samples.push(`${rel}: ${m}  ->  [[${name}]]`);
      return `[[${name}]]`;
    });
  });
  if (n > 0) {
    totalRepl += n; filesChanged++;
    if (apply) fs.writeFileSync(f, lines.join('\n'), 'utf8');
  }
}

console.log(JSON.stringify({
  mode: apply ? 'APPLIED' : 'DRY-RUN', scanned: files.length, filesChanged, totalRepl, skipped,
  protectedFiles: protectedList,
  topMissing: [...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
  samples,
}, null, 1));
