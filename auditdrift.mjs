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
 *   node auditdrift.mjs <repo-path> <audited-commit> [head-commit] [--json]
 *
 * Output: markdown report to stdout (or JSON with --json).
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';

// ---------- CLI parsing -------------------------------------------------

function fail(msg) {
  console.error(`auditdrift: ${msg}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.includes('-h') || argv.includes('--help') || argv.length < 2) {
  console.log('auditdrift — post-audit drift scanner (PoC)\n\n' +
    'Usage:\n' +
    '  node auditdrift.mjs <repo-path> <audited-commit> [head-commit] [--json]\n\n' +
    'Examples:\n' +
    '  node auditdrift.mjs ./my-repo d3756dd\n' +
    '  node auditdrift.mjs ./my-repo v1.0.0 HEAD\n');
  process.exit(0);
}

const flags = new Set(argv.filter((a) => a.startsWith('--')));
const pos = argv.filter((a) => !a.startsWith('--'));
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

  const contracts = entries.filter((e) => ['solidity', 'rust-program', 'rust', 'ts'].includes(e.kind));
  const tests = entries.filter((e) => e.kind === 'test');
  const scripts = entries.filter((e) => e.kind === 'foundry-script');
  const other = entries.filter((e) => !contracts.includes(e) && !tests.includes(e) && !scripts.includes(e));
  const hot = contracts.filter((e) => e.score >= 3).sort((a, b) => b.score - a.score);
  const cool = contracts.filter((e) => e.score < 3).sort((a, b) => b.score - a.score);

  if (flags.has('--json')) {
    console.log(JSON.stringify({
      repo, audited: { sha: auditedSha, info: auditedInfo },
      head: { sha: headSha, info: headInfo },
      totals: { files: entries.length, contracts: contracts.length, tests: tests.length, other: other.length, highRisk: hot.length },
      highRisk: hot, lowRiskContracts: cool, other,
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
