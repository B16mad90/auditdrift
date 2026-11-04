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

```
## Storage layout (state variable) changes
| File | Contract | Verdict | Details |
|------|----------|---------|---------|
| `src/strategies/EtherfiEETHStrategy.sol` | EtherfiEETHMYTStrategy | LAYOUT SHIFT — inserted before existing vars | BPS, MAX_GROSS_REDEEM_AMOUNT_BUFFER, … |
| `src/strategies/ERC4626Strategy.sol` | ERC4626Strategy | appended-only (layout stable) | canForceDeallocate |
```

Full sample reports from real runs are in [`examples/`](examples/):
- [Alchemix V3](examples/alchemix-v3-sample-report.md) — 158 files changed, 21 high-risk, 4 files with potential storage-layout changes since the audited commit (signals for manual review, not confirmed issues), plus an audit PDF scope cross-reference
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

## Storage layout diff

For every **modified** Solidity file, auditdrift parses the declared state variables at both commits (heuristic v1: single-line, top-level vars of each contract, in declaration order) and detects the bug class that matters most for upgrades:

**Known v1 limitations (honest):** does not handle inherited state variables, packed variables (multiple per storage slot), multi-line structs, or pragma/version-specific behavior. Deterministic (same input → same output), but determinism ≠ correctness: results are signals to investigate, not verified findings. A layout shift is only unsafe for an *existing deployed instance* that is upgraded in place — a fresh deployment is unaffected. Risk scores are heuristic weights, not validated.

- **LAYOUT SHIFT** — a state var removed, or inserted *before* existing vars (breaks storage of any deployed instance)
- **appended-only** — new var(s) after all old ones (layout stays stable)

## Audit scope cross-reference (`--audit-pdf`)

Pass one or more audit report PDFs:

```bash
node auditdrift.mjs ./my-repo d3756dd HEAD --audit-pdf ./audits/2025-07-15-zellic.pdf
```

It extracts the file paths declared in the PDF's scope section, matches them to repo files, and tells you exactly **how many audited files changed since the audited commit** — with status and risk score. Requires `python` with `pypdf` on PATH.

## What it flags (risk heuristics)

| Signal | Weight |
|--------|--------|
| Storage layout shift (state var removed/inserted) | +3 each |
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

- [x] **M1 (this repo):** single-repo scan, git-diff based, risk scoring, **storage-layout diff**, **`--audit-pdf` scope cross-reference** (multi-PDF), markdown + JSON output, zero npm dependencies (Node + git + optional python/pypdf). Validated on real audited repos: Alchemix V3 (4 real storage-layout shifts found) and Uniswap v3-core.
- [ ] **M2:** GitHub Action (flag post-audit drift in CI), Foundry `drift check` target, multi-audit coverage matrix (N audits × M files)
- [ ] **M3:** Rust/Anchor state diff for Solana programs, docs site + hosted demo (free tier)
- [ ] Hardened Solidity layout parser (multi-line structs, nested contracts, pragma/version-aware)

## Why this is a public good

- **Bounty hunters** (100+ active on any major protocol) spend hours on this triage per opportunity.
- **Audit firms** re-verify prior audits before re-audits; a machine-generated drift report is a cheaper, more consistent first pass.
- **Protocol teams** get a CI check that tells them exactly which audited surface moved.
- **DAOs** can see, per audit, how much of the audited surface is still "audited" vs. drifted.

## License

MIT

## Author

Built by an independent security researcher who does this triage manually every day across multiple active bug bounties. This PoC is the exact workflow, codified. Seeking ecosystem support (EF ESP / Gitcoin / Superteam) — the current ask is a 6-week, $5k pilot to make the tool reliable and measurable (regression suite, benchmark, hardened parser, GitHub Action, limits doc); see the project's public updates for the full plan.
