# Gitcoin Grants Stack Builder — profil-innhold

**URL:** https://grants.gitcoin.co/ (log in → Grants Stack Builder → New Project)
**Når:** runder kjører kvartalsvis — sjekk nettsiden for neste runde før deadline. Bygg profilen **nå**; søk i neste runde.

---

## Project name
auditdrift

## One-liner
The post-audit drift scanner — point it at any repo + the audited commit and get a ranked report of what changed, and how much of your audited surface moved.

## Category
Developer tools / Security

## Website
https://github.com/B16mad90/auditdrift

## Social
- (X/Twitter-profil — opprett en med 2–3 tweets om prosjektet før runden starter)
- (valgfritt: Telegram/Farcaster)

## Proof of work (repo link)
https://github.com/B16mad90/auditdrift
Working PoC + real sample reports (Alchemix V3, Uniswap v3-core) included in the repo.

## Why we exist (long description)

Every security audit covers a *specific commit*. Protocols keep shipping code after audits — and "some contracts were modified after they were audited" is now a standard line in bug bounty scope pages, and the first question every researcher must answer by hand: diff the commits, classify the files, work out which changes touch security-critical surface.

We built the tool we were missing, and it works today: **auditdrift** is a MIT-licensed CLI (Node + git, zero dependencies) that produces a ranked drift report — high-risk contract changes, a deterministic **storage-layout diff** (the exact bug class that breaks deployed upgrades), and cross-referencing against the actual audit PDF's scope section.

**What this grant funds:**
1. **M2** — a GitHub Action that opens an issue when a repo's post-audit drift crosses a threshold (free CI check for every audited protocol), plus a Foundry `drift check` target and multi-audit coverage matrices.
2. **M3** — Rust/Anchor state diff for Solana programs, docs site, hosted demo.

**Impact:** every protocol with an audit gets a free, automated view of how much of its audited surface has moved. Bounty hunters get cheaper, faster triage → more effective audits. Audit firms get a consistent machine-first pass before re-audits. It's a public good: no infra cost, no centralization, runs locally in a second.

## Budget
$10,000 (QF round). Breakdown: M2 tooling (Action + Foundry + multi-audit) $6,000 · M3 (Rust/Anchor + docs + demo) $4,000.

## Milestones

| # | Deliverable | Public proof |
|---|-------------|--------------|
| 1 | GitHub Action: `auditdrift/action` — CI flag on post-audit drift | public Action repo + demo on a real protocol repo |
| 2 | Foundry `drift check` target | integration test in repo |
| 3 | Multi-audit matrix (N audits × M files) | sample report in examples/ |
| 4 | Rust/Anchor state diff | Solana sample report |
| 5 | Docs site + hosted demo | live URL |

## Team
Solo builder — independent security researcher, active bug bounty hunter, Solidity/Rust/TS. (Lenke til GitHub. Vær ærlig om at du er solo; QF-belønner befolkning, ikke teamstørrelse.)

## Treasury
(Setter du selv opp: wallet som mottar QF-penger. Sjekk Gitcoins krav til treasury-oppsett i Builder.)

---

## QF-triks (før runden starter, 2–3 uker)
1. **Bygg i public:** 2–4 tweets om M1-resultatene (f.eks. "auditdrift found 4 real storage-layout shifts in Alchemix V3 since the audit commit — one strategy had 5 state vars removed. The tool: github.com/B16mad90/auditdrift")
2. **10–30 små donasjoner** (1–10 DAI/USDC) fra folk du kjenner (Vegard, TechHedge-nettverket, bounty-kretsen) — i QF kan 1 DAI bli matchet til ~40x; det er donasjonene som driver match-budsjettet, ikke størrelsen.
3. **Be om delt, ikke be om penger** — folk deler gjerne en lenke; det er det som trengs.
4. **Søknadsperiode:** søk med profil i den første uken — tidlig innsending får tid til å nå folk.
