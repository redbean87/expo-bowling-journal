#!/usr/bin/env node
/**
 * Regenerates the MODULE-MAP generated blocks in docs/module-map.md.
 *
 * The six subsystem file/test lists below are hand-maintained. Everything the
 * script emits — line/byte counts (wc -l / wc -c semantics), exported names,
 * in-repo dependencies, importers, colocated test files, totals, and the
 * HEAD/date stamp — is measured from the working tree, so two consecutive
 * runs produce byte-identical blocks.
 *
 * The script writes only between the marker pairs
 *   <!-- MODULE-MAP:GENERATED:<letter>:BEGIN -->  /  <!-- MODULE-MAP:GENERATED:<letter>:END -->
 * and never touches the hand-written prose (purpose, invariants, verification
 * commands). It emits no prose: only structured lists and the stamp comment.
 *
 * Usage:
 *   node scripts/module-map.mjs           regenerate the blocks in docs/module-map.md
 *   node scripts/module-map.mjs --check   exit 0 when the committed blocks match the
 *                                         working tree, non-zero otherwise
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC_REL = 'docs/module-map.md';
// Search space for the importer lookup: every source and test directory.
const SEARCH_DIRS = ['app', 'convex', 'src', 'tests', 'worker/src'];
const CODE_EXT = /\.(ts|tsx|js|mjs)$/;

// The six hand-written file lists (source files and colocated test files per
// subsystem). Test entries are either a file path or { dir } for a
// directory-level summary of every *.test.ts under that directory.
const SUBSYSTEMS = [
  {
    letter: 'A',
    title: 'Journal creation queue and syncer',
    files: [
      'src/screens/journal/journal-create-queue.ts',
      'src/screens/journal/journal-create-queue-sync.ts',
      'src/screens/journal/journal-create-queue-storage.ts',
      'src/screens/journal/journal-offline-create.ts',
      'src/screens/journal/queue-sync-events.ts',
      'src/screens/journal/queue-sync-presence.ts',
      'src/screens/journal/journal-client-sync-map-storage.ts',
      'src/screens/journal/reference-create-queue.ts',
      'src/screens/journal/reference-create-queue-sync.ts',
      'src/screens/journal/reference-create-queue-storage.ts',
      'src/screens/journal/reference-draft-id.ts',
    ],
    tests: [
      'tests/journal/journal-create-queue.test.ts',
      'tests/journal/queue-sync-presence.test.ts',
      'tests/journal/reference-create-queue.test.ts',
      'tests/journal/reference-draft-id.test.ts',
    ],
  },
  {
    letter: 'B',
    title: 'Session and mutation hooks',
    files: [
      'src/hooks/journal/use-session-mutations.ts',
      'src/hooks/journal/use-sessions.ts',
      'src/hooks/journal/use-session-queue.ts',
      'src/hooks/journal/use-session-route-sync.ts',
      'src/hooks/journal/index.ts',
    ],
    tests: [
      'tests/hooks/journal-hooks-offline.test.ts',
      'tests/hooks/stubs/journal-hooks-stubs.ts',
    ],
  },
  {
    letter: 'C',
    title: 'Game-editor autosave sync',
    files: [
      'src/screens/game-editor/use-game-editor-autosave-sync.ts',
      'src/screens/game-editor/game-editor-autosave-utils.ts',
      'src/screens/game-editor/game-editor-frame-utils.ts',
      'src/screens/game-editor/game-editor-screen-utils.ts',
      'src/hooks/journal/use-game-editor.ts',
      'src/screens/game-editor/use-game-editor-hydration.ts',
    ],
    tests: [
      'tests/game-editor/game-editor-autosave-utils.test.ts',
      'tests/game-editor/game-editor-frame-utils.test.ts',
    ],
  },
  {
    letter: 'D',
    title: 'Game-save queue syncer',
    files: [
      'src/providers/game-save-queue-syncer.tsx',
      'src/screens/game-editor/game-save-queue.ts',
      'src/screens/game-editor/game-save-queue-sync.ts',
      'src/screens/game-editor/game-save-queue-sync-core.ts',
      'src/screens/game-editor/game-save-queue-sync-storage.ts',
      'src/screens/game-editor/game-save-queue-storage.ts',
      'src/screens/game-editor/game-save-queue-status.ts',
    ],
    tests: [
      'tests/providers/game-save-queue-syncer.test.ts',
      'tests/providers/stubs/syncer-stubs.ts',
      'tests/game-editor/game-save-queue-sync.test.ts',
      'tests/game-editor/game-save-queue.test.ts',
      'tests/game-editor/game-save-queue-status.test.ts',
      'tests/game-editor/game-save-queue-retry-contract.test.ts',
      'tests/navigation/stubs/game-save-queue-syncer.mjs',
    ],
  },
  {
    letter: 'E',
    title: 'Connectivity/offline layer',
    files: ['src/services/connectivity.ts'],
    tests: ['tests/connectivity.test.ts'],
  },
  {
    letter: 'F',
    title: 'Import pipeline (client + convex + worker)',
    files: [
      'src/hooks/journal/use-import-backup.ts',
      'src/hooks/journal/import-backup/import-upload-client.ts',
      'src/hooks/journal/import-backup/file-validation.ts',
      'src/hooks/journal/import-backup/file-picker-web.ts',
      'convex/imports.ts',
      'worker/src/index.js',
      'worker/src/sqlite_parser.js',
      'worker/src/sqlite_exporter.js',
      'worker/src/callback_payload.js',
      'worker/src/health.js',
    ],
    tests: [
      'tests/hooks/import-backup-offline.test.ts',
      'tests/hooks/stubs/import-backup-stubs.ts',
      { dir: 'tests/import' },
    ],
  },
];

// --- measurement helpers ---------------------------------------------------

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function toRel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

/** wc -l / wc -c semantics: lines = newline count, bytes = file size. */
function measure(rel) {
  const buf = readFileSync(path.join(ROOT, rel));
  let lines = 0;
  for (const b of buf) if (b === 0x0a) lines += 1;
  return { lines, bytes: buf.length };
}

const n = (num) => num.toLocaleString('en-US');

function requireFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) {
    console.error(`module-map: missing file: ${rel}`);
    process.exit(1);
  }
  return abs;
}

/** Names exported by `export { a, b as c, type T }` style blocks. */
function specNames(inner) {
  const names = [];
  for (const raw of inner.split(',')) {
    let spec = raw.trim();
    if (!spec) continue;
    spec = spec.replace(/^type\s+/, '').trim();
    const as = spec.match(/\bas\s+([A-Za-z_$][\w$]*)\s*$/);
    if (as) names.push(as[1]);
    else if (/^[A-Za-z_$][\w$]*$/.test(spec)) names.push(spec);
  }
  return names;
}

/** All exported names of a TypeScript/JavaScript source file, in order. */
function exportedNames(source) {
  const found = [];
  let m;
  const declRe =
    /(?:^|\n)export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = declRe.exec(source))) found.push({ index: m.index, name: m[1] });
  const defaultRe =
    /(?:^|\n)export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = defaultRe.exec(source)))
    found.push({ index: m.index, name: m[1] });
  const plainDefault = /(?:^|\n)export\s+default\b(?!\s*(?:function|class)\s)/g;
  while ((m = plainDefault.exec(source)))
    found.push({ index: m.index, name: 'default' });
  const namedRe = /(?:^|\n)export\s+(?:type\s*)?\{([\s\S]*?)\}/g;
  while ((m = namedRe.exec(source))) {
    for (const name of specNames(m[1])) found.push({ index: m.index, name });
  }
  found.sort((a, b) => a.index - b.index);
  const names = [];
  for (const f of found) if (!names.includes(f.name)) names.push(f.name);
  return names;
}

/**
 * Import edges of one file: { spec, names[] }. Covers named, type-only,
 * namespace, default, side-effect, and dynamic imports (multi-line aware).
 */
function importEdges(source) {
  const edges = [];
  let m;
  const namedRe =
    /import\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["']/g;
  while ((m = namedRe.exec(source)))
    edges.push({ spec: m[2], names: specNames(m[1]) });
  const nsRe = /import\s+\*\s+as\s+[A-Za-z_$][\w$]*\s+from\s+["']([^"']+)["']/g;
  while ((m = nsRe.exec(source))) edges.push({ spec: m[1], names: ['*'] });
  const defaultRe = /import\s+([A-Za-z_$][\w$]*)\s+from\s+["']([^"']+)["']/g;
  while ((m = defaultRe.exec(source)))
    edges.push({ spec: m[2], names: [m[1]] });
  const sideRe = /(?:^|\n)import\s+["']([^"']+)["']/g;
  while ((m = sideRe.exec(source))) edges.push({ spec: m[1], names: [] });
  const dynRe = /import\(\s*["']([^"']+)["']/g;
  while ((m = dynRe.exec(source))) edges.push({ spec: m[1], names: [] });
  // Re-exports are dependencies too (barrel files).
  const reExportRe =
    /(?:^|\n)export\s+(?:type\s*)?\{([\s\S]*?)\}\s+from\s+["']([^"']+)["']/g;
  while ((m = reExportRe.exec(source)))
    edges.push({ spec: m[2], names: specNames(m[1]) });
  const starRe = /(?:^|\n)export\s+\*\s+from\s+["']([^"']+)["']/g;
  while ((m = starRe.exec(source))) edges.push({ spec: m[1], names: ['*'] });
  return edges;
}

/** Resolve a relative or `@/` (-> src/) specifier to a repo file, or null. */
function resolveSpec(spec, fromAbs) {
  let base = null;
  if (spec.startsWith('./') || spec.startsWith('../')) {
    base = path.resolve(path.dirname(fromAbs), spec);
  } else if (spec.startsWith('@/')) {
    base = path.resolve(ROOT, 'src', spec.slice(2));
  } else {
    return null;
  }
  for (const cand of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.d.ts`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

function collectSearchFiles() {
  const files = [];
  for (const dir of SEARCH_DIRS) {
    const abs = path.join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const full of walkFiles(abs)) {
      const rel = toRel(full);
      if (!CODE_EXT.test(full)) continue;
      if (rel.startsWith('convex/_generated/')) continue;
      files.push(rel);
    }
  }
  return files.sort();
}

/** Reverse index: target file -> sorted list of repo files that import it. */
function buildImporterIndex(searchFiles) {
  const raw = new Map();
  for (const rel of searchFiles) {
    const abs = path.join(ROOT, rel);
    for (const { spec } of importEdges(readFileSync(abs, 'utf8'))) {
      const resolved = resolveSpec(spec, abs);
      if (!resolved) continue;
      const target = toRel(resolved);
      if (!raw.has(target)) raw.set(target, new Set());
      raw.get(target).add(rel);
    }
  }
  const result = new Map();
  for (const [target, set] of raw) result.set(target, [...set].sort());
  return result;
}

/** In-repo dependencies of one file: target rel -> imported names, sorted. */
function depsFor(rel) {
  const source = readFileSync(path.join(ROOT, rel), 'utf8');
  const map = new Map();
  for (const { spec, names } of importEdges(source)) {
    const resolved = resolveSpec(spec, path.join(ROOT, rel));
    if (!resolved) continue;
    const target = toRel(resolved);
    if (!map.has(target)) map.set(target, []);
    for (const name of names)
      if (!map.get(target).includes(name)) map.get(target).push(name);
  }
  return map;
}

function testDirAggregate(dirRel) {
  const abs = path.join(ROOT, dirRel);
  if (!existsSync(abs)) {
    console.error(`module-map: missing test dir: ${dirRel}`);
    process.exit(1);
  }
  let lines = 0;
  let bytes = 0;
  let count = 0;
  for (const full of walkFiles(abs)) {
    if (!/\.test\.ts$/.test(full)) continue;
    const m = measure(toRel(full));
    lines += m.lines;
    bytes += m.bytes;
    count += 1;
  }
  return { count, lines, bytes };
}

function buildBlock(sub, ctx) {
  const lines = [];
  lines.push(`<!-- generated: head=${ctx.head} date=${ctx.date} -->`);
  lines.push('');
  lines.push('**Files**');
  lines.push('');
  const files = sub.files.map((rel) => ({ rel, ...measure(rel), names: [] }));
  for (const f of files) {
    const names = exportedNames(readFileSync(path.join(ROOT, f.rel), 'utf8'));
    f.names = names;
    let row = `- \`${f.rel}\` — ${n(f.lines)} lines / ${n(f.bytes)} bytes`;
    if (names.length > 0)
      row += ` — exports: ${names.map((x) => `\`${x}\``).join(', ')}`;
    lines.push(row);
  }
  lines.push('');
  lines.push('**Depends on** (in-repo imports; external packages omitted)');
  lines.push('');
  for (const f of files) {
    const base = f.rel.split('/').pop();
    const deps = [...depsFor(f.rel)].sort((a, b) => a[0].localeCompare(b[0]));
    if (deps.length === 0) {
      lines.push(`- \`${base}\` — none`);
      continue;
    }
    const parts = deps.map(([target, names]) => {
      const namePart =
        names.length > 0 ? ` (\`${[...names].sort().join('`, `')}\`)` : '';
      return `\`${target}\`${namePart}`;
    });
    lines.push(`- \`${base}\` → ${parts.join('; ')}`);
  }
  lines.push('');
  lines.push(
    '**Imported by** (searched: `app/`, `convex/`, `src/`, `tests/`, `worker/src`)'
  );
  lines.push('');
  for (const f of files) {
    const base = f.rel.split('/').pop();
    const importers = ctx.importers.get(f.rel) || [];
    if (importers.length === 0) {
      lines.push(`- \`${base}\` — none`);
      continue;
    }
    lines.push(
      `- \`${base}\` ← ${importers.map((i) => `\`${i}\``).join(', ')}`
    );
  }
  lines.push('');
  lines.push('**Colocated tests**');
  lines.push('');
  let tLines = 0;
  let tBytes = 0;
  for (const t of sub.tests) {
    if (t.dir) {
      const a = testDirAggregate(t.dir);
      tLines += a.lines;
      tBytes += a.bytes;
      lines.push(
        `- \`${t.dir}/\` — ${a.count} test files, ${n(a.lines)} lines / ${n(a.bytes)} bytes (directory totals)`
      );
      continue;
    }
    const m = measure(t);
    tLines += m.lines;
    tBytes += m.bytes;
    lines.push(`- \`${t}\` — ${n(m.lines)} lines / ${n(m.bytes)} bytes`);
  }
  lines.push('');
  const fLines = files.reduce((sum, f) => sum + f.lines, 0);
  const fBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  lines.push(
    `**Totals** — files: ${n(fLines)} lines / ${n(fBytes)} bytes; colocated tests: ${n(tLines)} lines / ${n(tBytes)} bytes`
  );
  return lines.join('\n');
}

// --- doc plumbing ----------------------------------------------------------

function headSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      cwd: ROOT,
    }).trim();
  } catch {
    return 'unknown';
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function markers(letter) {
  return {
    begin: `<!-- MODULE-MAP:GENERATED:${letter}:BEGIN -->`,
    end: `<!-- MODULE-MAP:GENERATED:${letter}:END -->`,
  };
}

function blockInDoc(doc, letter) {
  const { begin, end } = markers(letter);
  const start = doc.indexOf(begin);
  const endIdx = doc.indexOf(end, start === -1 ? 0 : start);
  if (start === -1 || endIdx === -1) return null;
  // Generator-written form is `BEGIN\n<block>\n\nEND`; strip surrounding newlines.
  const raw = doc.slice(start + begin.length, endIdx);
  return raw.replace(/^\n/, '').replace(/\n+$/, '');
}

function writeBlocks(doc, blocks, ctx) {
  let out = doc;
  for (const sub of SUBSYSTEMS) {
    const { begin, end } = markers(sub.letter);
    const start = out.indexOf(begin);
    const endIdx = out.indexOf(end, start === -1 ? 0 : start);
    if (start === -1 || endIdx === -1) {
      console.error(
        `module-map: missing markers for subsystem ${sub.letter} in ${DOC_REL}`
      );
      process.exit(1);
    }
    const before = out.slice(0, start + begin.length);
    const after = out.slice(endIdx);
    out = `${before}\n${blocks[sub.letter]}\n\n${after}`;
  }
  return out;
}

function main() {
  const check = process.argv[2] === '--check';
  const docPath = path.join(ROOT, DOC_REL);
  if (!existsSync(docPath)) {
    console.error(`module-map: missing doc: ${DOC_REL}`);
    process.exit(1);
  }
  const doc = readFileSync(docPath, 'utf8');
  const ctx = {
    head: headSha(),
    date: today(),
    importers: buildImporterIndex(collectSearchFiles()),
  };
  const blocks = {};
  for (const sub of SUBSYSTEMS) {
    for (const rel of sub.files) requireFile(rel);
    blocks[sub.letter] = buildBlock(sub, ctx);
  }
  if (check) {
    const stale = [];
    for (const sub of SUBSYSTEMS) {
      const current = blockInDoc(doc, sub.letter);
      if (current === null) {
        stale.push(`${sub.letter} (missing markers)`);
        continue;
      }
      if (current !== blocks[sub.letter]) stale.push(sub.letter);
    }
    if (stale.length > 0) {
      console.error(
        `module-map: generated blocks do not match the working tree: ${stale.join(', ')}`
      );
      console.error('module-map: regenerate with: node scripts/module-map.mjs');
      process.exit(1);
    }
    console.log(
      `module-map: generated blocks match HEAD ${ctx.head} (${ctx.date}).`
    );
    return;
  }
  const next = writeBlocks(doc, blocks, ctx);
  writeFileSync(docPath, next);
  console.log(
    `module-map: wrote ${SUBSYSTEMS.length} generated blocks (HEAD ${ctx.head}, ${ctx.date}).`
  );
}

main();
