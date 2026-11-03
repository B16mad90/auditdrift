# auditdrift 🔍

**Post-audit drift scanner for EVM & Rust repos.**

Every security audit covers a *specific commit*. Months later, the code has moved on — and the most common line in bug bounty scope pages is *"Some contracts were modified after they were audited."* Answering that question by hand (git log, manual diff review, cross-checking audit PDFs) takes hours per repo.

`auditdrift` automates the first pass: point it at a repo + the audited commit, and get a prioritized markdown report of what changed, ranked by how much the change touches security-critical surface.

## Quick start

```bash
# Requires: Node >= 18, git
node auditdrift.mjs <repo-path> <audited-commit> [head-commit]
node auditdrift.mjs <repo-path> <audited-commit> [head-commit] --json
```

Example:

```bash
node auditdrift.mjs ./alchemix-v3 8dd21a2 master
```

Output (excerpt, real run on Alchemix V3, audited commit → master, 6 months apart):

Full sample reports from real runs are in [`examples/`](examples/):
- [Alchemix V3](examples/alchemix-v3-sample-report.md) — 158 files changed, 21 high-risk (new unaudited strategies, storage-layout churn)
- [Uniswap v3-core](examples/uniswap-v3-core-sample-report.md) — 1.0.0 → HEAD, 1 high-risk hit in `Tick.sol`

```
# auditdrift report — alchemix-v3

- **Audited commit:** `8dd21a2` — 2026-04-11 updated cover system ...
- **Compared to:**    `ca577e8` — 2026-10-27 Merge pull request #59 ...
- **Scope:** 158 files changed · 24 source files · **21 high-risk**

## High-risk contract changes (score ≥ 3)
| # | File | Change | Score | Why |
|---|------|--------|-------|-----|
| 1 | `src/strategies/FluidLiteETHStrategy.sol` | added | 16 | new file (never audited); struct change (possible storage-layout); access-control / modifier churn |
| 2 | `src/strategies/StakeDAOWETHStrategy.sol` | added | 16 | new file (never audited); access-control / modifier churn; native-value transfer path |
...
```

## What it flags (risk heuristics)

| Signal | Weight |
|--------|--------|
| New file (never audited) | +3 |
| Storage state added (mappings, structs) — layout risk | +3 each |
| Access-control / modifier churn (onlyOwner, roles, pausable, reentrancyGuard) | +3 |
| Native-value transfer path (payable, .call{}, transfer) | +3 |
| Proxy / upgrade surface (delegatecall, initializ*) | +3 |
| Raw call / assembly usage | +3 |
| New external/public functions | +2 |
| Token transfer path (IERC20/721/1155) | +2 |
| Oracle / price / deviation logic | +2 |
| Deleted audited surface | +2 |
| Primary contract source path | +2 |
| Test-only / deploy-script context | −2 (down-weighted) |

Files are classified first (solidity / rust / foundry scripts / tests / config / docs) so deploy scripts, tests, CI and docs never drown out real contract changes.

## Status & roadmap

- [x] **PoC (this repo):** single-repo scan, git-diff based, markdown + JSON output, ~300 lines, zero dependencies beyond Node + git
- [ ] `--audit-pdf` mode: ingest audit report PDFs, map scope files per audit, produce a per-audit "in scope & changed" matrix
- [ ] Storage-layout diff: parse Solidity structs/state vars at both commits, detect layout shifts (the #1 real bug class in post-audit drift)
- [ ] GitHub Action: open an issue when a repo's post-audit drift exceeds a threshold — free for every project with an audit
- [ ] Multi-audit mode: repo with N audits → N×M (audit × file) coverage matrix
- [ ] Foundry integration: `drift check` target that can be added to any repo's CI
- [ ] Docs site + hosted demo (free tier)

## Why this is a public good

- **Bounty hunters** (100+ active on any major protocol) spend hours on this triage per opportunity.
- **Audit firms** re-verify prior audits before re-audits; a machine-generated drift report is a cheaper, more consistent first pass.
- **Protocol teams** get a CI check that tells them exactly which audited surface moved.
- **DAOs** can see, per audit, how much of the audited surface is still "audited" vs. drifted.

## License

MIT (to be finalized)

## Author

Built by an independent security researcher who does this triage manually every day across multiple active bug bounties. This PoC is the exact workflow, codified.
