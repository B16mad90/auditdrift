#!/usr/bin/env node
/**
 * auditdrift — Post-audit drift scanner for EVM/Rust repos.
 *
 * Compares an "audited" commit (the commit a security audit covered) with a
 * later commit (e.g. HEAD) and produces a prioritized markdown report of
 * everything that changed in between — the exact question bounty hunters
 * and auditors always have to answer by hand:
 *
 *   "Which contracts were modified after they were audited, and how risky
 *    is each change?"
 *
 * PoC (grant proposal stage). Node >= 18, uses `git` from PATH only.
 *
 * Usage:
 *   node auditdrift.mjs <repo-path> <audited-commit> [head-commit] [flags]
 *
 * Flags:
 *   --json                Output JSON instead of markdown
 *   --audit-pdf <file>    Cross-reference an audit report PDF's scope section
 *                         (repeatable). Requires `python` with `pypdf` on PATH.
 *
 * Output: markdown report to stdout (or JSON with --json).
 */

import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

// ---------- CLI parsing -------------------------------------------------

function fail(msg) {
  console.error(`auditdrift: ${msg}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help') || argv.length < 2) {
  console.log('auditdrift — post-audit drift scanner (M1)\n\n' +
    'Usage:\n' +
    '  node auditdrift.mjs <repo-path> <audited-commit> [head-commit] [flags]\n\n' +
    'Flags:\n' +
    '  --json                Output JSON instead of markdown\n' +
    '  --audit-pdf <file>    Cross-reference an audit PDF scope section (repeatable)\n\n' +
    'Examples:\n' +
    '  node auditdrift.mjs ./my-repo d3756dd\n' +
    '  node auditdrift.mjs ./my-repo v1.0.0 HEAD --audit-pdf ./audits/2025-07-15-zellic.pdf\n');
  process.exit(0);
}

const flags = new Set();
const auditPdfs = [];
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--audit-pdf') { auditPdfs.push(argv[++i]); }
  else if (a.startsWith('--')) flags.add(a);
  else pos.push(a);
}
const [repoPath, auditedRef, headRef = 'HEAD'] = pos;

const repo = path.resolve(repoPath);
const git = (args, cwd = repo) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// ---------- helpers ------------------------------------------------------

/** Is this file a security-relevant source file? */
function kindOf(file) {
  const isTestPath = /(\.test\.|\.spec\.|__tests__|\/tests?\/|\/test\/|\.t\.sol$)/.test(file);
  if (/\.s\.sol$/.test(file)) return 'foundry-script'; // deploy scripts — low risk
  if (isTestPath) return 'test';
  if (/\.(sol)$/.test(file)) return 'solidity';
  if (/\.(rs)$/.test(file) && /(^|\/)programs\//.test(file)) return 'rust-program';
  if (/\.(rs)$/.test(file)) return 'rust';
  if (/\.(ts|js)$/.test(file) && !/(\/node_modules\/)/.test(file)) return 'ts';
  if (/^(package\.json|Cargo\.toml|hardhat\.config|foundry\.toml|\.gitmodules)/.test(file)) return 'config';
  if (/\.(md|txt|png|jpg|pdf|svg|sh|json)$/.test(file) || /^(docs|README|LICENSE)/i.test(file) || /broadcast\//.test(file)) return 'docs';
  return 'other';
}

// ---------- audit PDF scope extraction ---------------------------------

/** Find a usable python interpreter with pypdf. */
function findPython() {
  const candidates = [
    'python', 'python3', 'py',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python'),
  ];
  const all = [...candidates];
  for (const base of candidates) {
    if (base.includes('Programs')) {
      try {
        for (const d of fs.readdirSync(base)) {
          all.push(path.join(base, d, process.platform === 'win32' ? 'python.exe' : 'python'));
        }
      } catch { /* ignore */ }
    }
  }
  for (const exe of all) {
    try {
      execFileSync(exe, ['-c', 'import pypdf'], { stdio: 'ignore' });
      return exe;
    } catch { /* try next */ }
  }
  return null;
}
const PYTHON_EXE = findPython();

/**
 * Extract text from a PDF using python + pypdf (invoked via child process).
 * Returns { text, pages } or null on failure.
 */
function pdfText(pdfPath) {
  if (!PYTHON_EXE) return { text: null, error: 'no python interpreter with pypdf found on PATH' };
  const py = [
    'import sys',
    'sys.stdout.reconfigure(encoding="utf-8", errors="replace")',
    'from pypdf import PdfReader',
    'r = PdfReader(sys.argv[1])',
    'nl = chr(10)',
    'sys.stderr.write(("PAGES:%d" % len(r.pages)) + nl)',
    'sys.stdout.write(nl.join((p.extract_text() or "") for p in r.pages))',
  ].join('\n');
  const r = spawnSync(PYTHON_EXE, ['-c', py, pdfPath], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0) {
    const msg = (r.stderr || r.error?.message || 'unknown').toString().trim();
    return { text: null, error: msg.split('\n').pop() };
  }
  const m = (r.stderr || '').match(/PAGES:(\d+)/);
  return { text: r.stdout, pages: m ? Number(m[1]) : 0 };
}

/** Pull candidate file paths out of a PDF's text (scope sections). */
function extractScopePaths(text) {
  const found = new Set();
  const patterns = [
    /[A-Za-z0-9_\-./]+\.sol\b/g,                      // foo/bar/Baz.sol
    /`[A-Za-z0-9_\-./]+\.sol`/g,                       // `contracts/Baz.sol`
    /\b(?:contracts|src|programs|lib)\/[A-Za-z0-9_\-./]+/g, // dir paths w/o extension
  ];
  for (const re of patterns) {
    for (const m of text.match(re) || []) {
      let p = m.replace(/^`|`$/g, '');
      if (/(^|\/)lib\//.test(p)) continue;             // skip vendored libs
      if (p.startsWith('.')) p = p.slice(2);
      found.add(p);
    }
  }
  // drop substrings contained in longer matches (keep the most specific)
  const all = [...found];
  return all.filter((p) => !all.some((q) => q !== p && q.endsWith(p) && (q === `../${p}` || q.includes(`/${p}`))));
}

/**
 * Parse audit PDFs, extract their declared scope, and cross-reference with
 * the changed files. Best-effort v1: matches on suffix paths.
 */
function parseAuditPdfs(pdfPaths, entries, repo, git) {
  const allRepoFiles = git(['ls-files'], repo).split('\n').filter(Boolean);
  const changed = new Map(entries.map((e) => [e.file, e]));
  const pdfs = [];
  for (const pdf of pdfPaths) {
    const resolved = path.resolve(pdf);
    const { text, error, pages } = pdfText(resolved);
    const entry = {
      file: resolved,
      label: path.basename(resolved),
      parsedPages: pages || 0,
      scope: [],
      changedInScope: [],
      unmatched: [],
    };
    pdfs.push(entry);
    if (!text) { entry.scopeError = error; continue; }
    // restrict to the scope section when present (heuristic boundaries)
    const si = text.search(/\b(scope|scope of (this|the) (audit|report|review)\b)/i);
    const section = si >= 0 ? text.slice(si, si + 12000) : text.slice(0, 12000);
    entry.scope = extractScopePaths(section);
    for (const scopeFile of entry.scope) {
      // match repo file by exact path or suffix
      const repoFile =
        allRepoFiles.find((f) => f === scopeFile) ||
        allRepoFiles.find((f) => f.endsWith(`/${scopeFile}`)) ||
        allRepoFiles.find((f) => scopeFile.endsWith(`/${f}`) && f.length > 8);
      if (!repoFile) { entry.unmatched.push(scopeFile); continue; }
      const ch = changed.get(repoFile);
      if (ch) entry.changedInScope.push({ audited: scopeFile, repoFile, status: ch.status, score: ch.score });
    }
  }
  return { pdfs };
}

// ---------- storage layout diff ----------------------------------------

/**
 * Heuristic Solidity parser: extracts top-level state variables per contract
 * (name + type), in declaration order. Line-based v1: single-line structs/
 * enums are skipped, comments are stripped, `using ... for` is skipped.
 */
function parseLayout(source) {
  const contracts = [];
  let cur = null, depth = 0, inBlockComment = false;
  for (let raw of source.split('\n')) {
    if (inBlockComment) {
      if (raw.includes('*/')) inBlockComment = false;
      else continue;
    }
    if (raw.includes('/*')) {
      const idx = raw.indexOf('/*');
      raw = raw.slice(0, idx);
      if (!raw.includes('*/')) inBlockComment = true;
    }
    const l = raw.replace(/\/\/.*$/, '');
    const opens = (l.match(/\{/g) || []).length;
    const closes = (l.match(/\}/g) || []).length;

    if (!cur) {
      const m = l.match(/^\s*(?:abstract\s+)?contract\s+(\w+)/);
      if (m) { cur = { name: m[1], vars: [] }; contracts.push(cur); depth = opens || 1; }
      continue;
    }

    if (depth === 1) {
      const t = l.trim();
      if (t.endsWith(';') && !t.includes('(') && !/^(struct|enum|event|error|using)\b/.test(t)) {
        const vm = t.match(/^(.*?)([A-Za-z_$][\w$]*)\s*(public|private|internal)?\s*(?:=|;)/s)
          || t.match(/^([\w.]+(?:\s*\[\s*\])?)\s+([A-Za-z_$][\w$]*)\s*;/);
        if (vm) cur.vars.push({ type: (vm[1] || '').trim(), name: vm[2] || vm[1] });
      }
      depth += opens - closes;
    } else {
      depth += opens - closes;
      if (depth <= 0) { depth = 0; cur = null; }
    }
  }
  return contracts;
}

/** Compare ordered state-var lists. Returns a verdict for storage layout. */
function layoutVerdict(oldVars, newVars) {
  const o = oldVars.map((v) => v.name);
  const n = newVars.map((v) => v.name);
  const removed = o.filter((x) => !n.includes(x));
  const added = n.filter((x) => !o.includes(x));
  const remaining = n.filter((x) => o.includes(x));
  const orderPreserved = remaining.every((x, i) => i === 0 || o.indexOf(remaining[i - 1]) < o.indexOf(x));
  if (removed.length) return { verdict: 'LAYOUT SHIFT — state var(s) removed', added, removed };
  if (!orderPreserved) return { verdict: 'LAYOUT SHIFT — state vars reordered', added, removed };
  if (added.length) {
    let maxOldPos = -1;
    for (const x of o) if (n.includes(x)) maxOldPos = Math.max(maxOldPos, n.indexOf(x));
    const appended = added.every((x) => n.indexOf(x) > maxOldPos);
    return appended
      ? { verdict: 'appended-only (layout stable)', added, removed }
      : { verdict: 'LAYOUT SHIFT — inserted before existing vars', added, removed };
  }
  return { verdict: 'no state var changes', added, removed };
}

/** Heuristic risk score for a changed source file. Returns [score, reasons[]]. */
function riskOf(file, status, patch) {
  const score = new Map(); // reason -> weight
  const bump = (reason, w) => score.set(reason, (score.get(reason) || 0) + w);

  if (status === 'A') bump('new file (never audited)', 3);
  if (status === 'D') bump('deleted (audited surface removed)', 2);
  if (status === 'R100' || status === 'R099') bump('renamed', 1);

  const k = kindOf(file);
  if (k === 'foundry-script') bump('deploy script (operational, not audited surface)', -2);
  if (k === 'solidity' || k === 'rust-program' || k === 'rust') {
    if (/(^|\/)(contracts|src|programs|lib|library)\//.test(file)) bump('primary contract source', 2);
    if (/(proxy|upgrade|delegatecall|initializ)/i.test(file)) bump('upgrade/proxy surface', 3);
  }

  const added = patch ? patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')) : [];
  const removed = patch ? patch.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')) : [];
  const addText = added.join('\n');
  const remText = removed.join('\n');

  if (/(mapping\s*\()/.test(addText)) bump('new storage state (mapping)', 3);
  if (/(struct\s+\w+|storage struct)/.test(addText)) bump('struct change (possible storage-layout)', 3);
  if (/(external|public)\s+function/.test(addText)) bump('new external/public function', 2);
  if (/(external|public)\s+function/.test(remText)) bump('function removed/changed signature', 2);
  if (/(onlyOwner|onlyRole|hasRole|accessControl|pausable|whenNotPaused|reentrancyGuard)/.test(addText + remText))
    bump('access-control / modifier churn', 3);
  if (/(address payable|transfer|call\s*\{|\.send\()/i.test(addText)) bump('native-value transfer path', 3);
  if (/(safeTransfer|IERC20|IERC721|IERC1155|ERC\d+|token)/i.test(addText)) bump('token transfer path', 2);
  if (/(oracle|price|deviation|TWAP)/i.test(addText + remText)) bump('oracle/price logic', 2);
  if (/(delegatecall|lowlevel|assembly\s*{)/i.test(addText)) bump('raw-call / assembly usage', 3);
  if (/[\*\/] ?\w+/m.test(addText) && /math|mul|div|precision|round/i.test(addText))
    bump('arithmetic change', 1);
  if (k === 'test') bump('test-only change (context)', -2);

  let total = 0;
  const reasons = [];
  for (const [reason, w] of [...score.entries()].sort((a, b) => b[1] - a[1])) {
    total += w;
    reasons.push(`${reason}${w < 0 ? ' (−)' : ''}`);
  }
  return { score: total, reasons };
}

// ---------- core ---------------------------------------------------------

function main() {
  // resolve refs
  const auditedSha = git(['rev-parse', auditedRef]).trim();
  const headSha = git(['rev-parse', headRef]).trim();
  const auditedInfo = git(['show', '-s', '--format=%ci %s', auditedSha]).trim();
  const headInfo = git(['show', '-s', '--format=%ci %s', headSha]).trim();

  // name-status diff
  const ns = git(['diff', '--name-status', '--no-renames', auditedSha, headSha])
    .split('\n').filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split('\t');
      return { status: status[0], file: rest.join('\t') };
    });

  // full patch for scoring (bounded)
  const patch = git(['diff', auditedSha, headSha, '--unified=0', '--', '*.sol', '*.rs', '*.ts', '*.js'])
    .split(/^diff --git /m).slice(1)
    .map((p) => 'diff --git ' + p);
  const patchFor = (file) => patch.find((p) => p.includes(` b/${file}`)) ?? '';

  const entries = ns.map(({ status, file }) => {
    const k = kindOf(file);
    const { score, reasons } = riskOf(file, status, patchFor(file));
    return { status, file, kind: k, score, reasons };
  });

  // storage-layout diff for modified Solidity files
  const fileAt = (sha, file) => {
    try {
      return git(['show', `${sha}:${file}`], repo);
    } catch {
      return null;
    }
  };
  const layoutResults = [];
  for (const { status, file } of ns) {
    if (status !== 'M' || kindOf(file) !== 'solidity') continue;
    const oldSrc = fileAt(auditedSha, file);
    const newSrc = fileAt(headSha, file);
    if (oldSrc == null || newSrc == null) continue;
    const oldC = parseLayout(oldSrc);
    const newC = parseLayout(newSrc);
    const pairs = newC
      .map((c) => {
        const oc = oldC.find((x) => x.name === c.name);
        return oc && oc.vars.length && c.vars.length ? { contract: c.name, v: layoutVerdict(oc.vars, c.vars) } : null;
      })
      .filter(Boolean);
    if (!pairs.length) continue;
    const shifts = pairs.filter((p) => !/appended-only|no state var/.test(p.v.verdict));
    const appends = pairs.filter((p) => /appended-only/.test(p.v.verdict));
    layoutResults.push({ file, shifts, appends });
    if (shifts.length) {
      const e = entries.find((x) => x.file === file);
      if (e) {
        e.score += 3 * shifts.length;
        e.reasons.unshift(`${shifts.length} storage-layout shift(s) in: ${shifts.map((s) => s.contract).join(', ')}`);
      }
    }
  }

  const contracts = entries.filter((e) => ['solidity', 'rust-program', 'rust', 'ts'].includes(e.kind));
  const tests = entries.filter((e) => e.kind === 'test');
  const scripts = entries.filter((e) => e.kind === 'foundry-script');
  const other = entries.filter((e) => !contracts.includes(e) && !tests.includes(e) && !scripts.includes(e));
  const hot = contracts.filter((e) => e.score >= 3).sort((a, b) => b.score - a.score);
  const cool = contracts.filter((e) => e.score < 3).sort((a, b) => b.score - a.score);

  // audit PDF scope cross-reference (--audit-pdf <path> ...)
  let auditScope = null;
  if (auditPdfs.length) {
    auditScope = parseAuditPdfs(auditPdfs, entries, repo, git);
  }

  if (flags.has('--json')) {
    console.log(JSON.stringify({
      repo, audited: { sha: auditedSha, info: auditedInfo },
      head: { sha: headSha, info: headInfo },
      totals: { files: entries.length, contracts: contracts.length, tests: tests.length, other: other.length, highRisk: hot.length },
      highRisk: hot, lowRiskContracts: cool, other,
      storageLayout: layoutResults,
      auditScope: auditScope ? auditScope.pdfs.map((p) => ({ file: p.file, scopeCount: p.scope.length, changedInScope: p.changedInScope.length })) : null,
    }, null, 2));
    return;
  }

  // markdown report
  const L = [];
  const st = (s) => ({ A: 'added', M: 'modified', D: 'deleted', R: 'renamed' }[s] ?? s);
  L.push(`# auditdrift report — ${path.basename(repo)}`);
  L.push('');
  L.push(`- **Audited commit:** \`${auditedSha.slice(0, 7)}\` — ${auditedInfo}`);
  L.push(`- **Compared to:**    \`${headSha.slice(0, 7)}\` — ${headInfo}`);
  L.push(`- **Scope:** ${entries.length} files changed · ${contracts.length} source files · **${hot.length} high-risk**`);
  L.push('');
  L.push('## High-risk contract changes (score ≥ 3)');
  L.push('');
  if (hot.length === 0) L.push('_None detected._');
  else {
    L.push('| # | File | Change | Score | Why |');
    L.push('|---|------|--------|-------|-----|');
    hot.forEach((e, i) => {
      const why = e.reasons.slice(0, 3).join('; ') || '—';
      L.push(`| ${i + 1} | \`${e.file}\` | ${st(e.status)} | ${e.score} | ${why} |`);
    });
  }
  L.push('');
  L.push('## Storage layout (state variable) changes');
  L.push('');
  if (layoutResults.length) {
    L.push('| File | Contract | Verdict | Details |');
    L.push('|------|----------|---------|---------|');
    for (const lr of layoutResults) {
      for (const p of [...lr.shifts, ...lr.appends]) {
        const d = [...p.v.added, ...p.v.removed.map((r) => `~${r}~`)].join(', ') || '—';
        L.push(`| \`${lr.file}\` | ${p.contract} | ${p.v.verdict} | ${d} |`);
      }
    }
  } else L.push('_No state-variable changes detected in modified Solidity files._');
  L.push('');

  if (auditScope) {
    L.push('## Audit scope cross-reference (from PDF scope sections)');
    L.push('');
    for (const pdf of auditScope.pdfs) {
      L.push(`**${pdf.label}** (parsed ${pdf.parsedPages} page(s), ${pdf.scope.length} scope item(s) found)`);
      L.push('');
      if (pdf.changedInScope.length) {
        L.push(`**${pdf.changedInScope.length} of ${pdf.scope.length} audited file(s) changed since the audited commit:**`);
        L.push('');
        L.push('| Audited file (per PDF) | Changed file in repo | Status | Score |');
        L.push('|------------------------|----------------------|--------|-------|');
        pdf.changedInScope.forEach((c) => {
          L.push(`| \`${c.audited}\` | \`${c.repoFile || '?'}\` | ${c.status || '?'} | ${c.score ?? '—'} |`);
        });
      } else {
        L.push('_All parsed scope files are unchanged since the audited commit._');
      }
      L.push('');
      if (pdf.scopeError) {
        L.push(`⚠️ Could not extract PDF text: ${pdf.scopeError}`);
        L.push('');
      }
      if (pdf.unmatched.length) {
        L.push(`_Unmatched scope items (no repo file found): ${pdf.unmatched.slice(0, 8).map((u) => `\`${u}\``).join(', ')}${pdf.unmatched.length > 8 ? ' …' : ''}_`);
        L.push('');
      }
    }
  }

  L.push('## Other contract changes (lower signal)');
  L.push('');
  if (cool.length === 0) L.push('_None._');
  else {
    L.push('| File | Change | Score | Notes |');
    L.push('|------|--------|-------|-------|');
    cool.forEach((e) => {
      L.push(`| \`${e.file}\` | ${st(e.status)} | ${e.score} | ${e.reasons.join('; ') || '—'} |`);
    });
  }
  L.push('');
  L.push(`## Context: ${tests.length} test file(s), ${scripts.length} deploy script(s), ${other.length} other file(s) changed`);
  L.push('');
  L.push('### Test changes');
  if (tests.length) tests.slice(0, 15).forEach((e) => L.push(`- \`${e.file}\` (${st(e.status)})`));
  else L.push('_None._');
  L.push('');
  L.push('### Non-contract changes');
  if (other.length) other.slice(0, 15).forEach((e) => L.push(`- \`${e.file}\` (${st(e.status)}, ${e.kind})`));
  if (other.length > 15) L.push(`- …and ${other.length - 15} more`);
  L.push('');
  L.push('### Deploy script changes (operational surface)');
  if (scripts.length) scripts.slice(0, 10).forEach((e) => L.push(`- \`${e.file}\` (${st(e.status)})`));
  else L.push('_None._');
  L.push('');
  L.push('---');
  L.push('_auditdrift PoC — heuristic triage, not a substitute for manual review._');
  console.log(L.join('\n'));
}

try {
  main();
} catch (err) {
  fail(err.message.split('\n')[0]);
}
