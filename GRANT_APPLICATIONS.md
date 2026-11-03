# Grant applications — auditdrift

Drafter utkast. Fyll inn navn/GitHub og tilpass før innsending.

---

## 1. EF Ecosystem Support Program (ESP) — direct grant

**URL:** https://esp.ethereum.foundation/ (How to Apply → Direct Grant)
**Format:** kort prosjektsøknad + budget + milestones. De har også gratis Office Hours før søknad — anbefales.

### Draft application (English)

> **Project:** auditdrift — Post-audit drift scanner for EVM protocols
>
> **Problem.** Security audits are scoped to a specific commit. Protocols continue to ship code after audits, and "contracts modified after audit" is now a standard line in bounty scopes. Researchers, audit firms and protocol teams currently re-derive this by hand: diffing commits, classifying files, cross-referencing audit PDFs. It is repetitive, error-prone, and a tax on every re-audit and bounty cycle.
>
> **Solution.** auditdrift is a CLI tool (Node + git, no dependencies) that takes a repo and an audited commit, and produces a prioritized report of all changes since, ranked by security-surface impact (storage layout, access control, value transfer, proxy/upgrade surface, raw calls, oracle logic). A working PoC already exists and has been validated on real audited repos (Uniswap v3-core, Alchemix V3, and several active bounty targets).
>
> **Why it's a public good.** Free, open source (MIT), runs locally — benefits every protocol with an audit: bounty hunters (faster, cheaper triage → more effective audits), audit firms (consistent pre-work for re-audits), and protocol teams (CI check on audited surface). No infra cost to run; no centralization.
>
> **Milestones & budget (proposal):**
>
> | Milestone | Deliverable | Budget |
> |-----------|-------------|--------|
> | M1 | Hardened v1: per-audit scope matrix (--audit-pdf), storage-layout diff for Solidity, tests, docs site | $8,000 |
> | M2 | GitHub Action + Foundry `drift check` target, multi-audit mode | $7,000 |
> | M3 | Rust/Anchor support, hosted demo, adoption (≥5 protocols using CI check) | $5,000 |
> | | **Total** | **$20,000** |
>
> (Budget skal justeres etter hva som virker rimelig — ESP har finansiert mindre og mer.)
>
> **Team.** Independent security researcher, active bug bounty hunter; Solidity/Go/TS, Foundry. (Lekk lenke til GitHub/Immunefi-profil her.)

### Tips for ESP
- De legger vekt på **open source fra dag én** — opprett GitHub-repo med MIT-lisens og PoC før søknad.
- Office Hours: book via deres kanal (hey.xyz/u/ef_esp eller Twitter/Farcaster) — få tilbakemelding før du sender.
- De liker konkrete, small-but-useful verktøy. Vi er i den sjelden kategorien som har *allerede kjørende PoC + validert på ekte data*.

---

## 2. Gitcoin Grants (quadratic funding, kvartalsrune)

**URL:** https://grants.gitcoin.co/ — søk i **Grants Stack Builder** (bygger én profil, gjenbruk i flere runder).
**Når:** runder kjører kvartalsvis; sjekk nettsiden for neste runde + deadline før søknadsperioden starter.

### Draft application

> **Name:** auditdrift
> **Category:** Developer tools / Security
> **One-liner:** The post-audit drift scanner — point it at any repo + audited commit and get a ranked report of what changed and how risky it is.
>
> **Why we exist.** After every audit, protocols keep shipping. "Modified after audit" is the first line of every bounty scope and the first question every researcher must answer by hand. We built the tool we were missing, and it works today (PoC, MIT, Node+git, zero deps).
>
> **What the grant funds.** v1 hardening (audit-PDF scope matrix, Solidity storage-layout diff), a GitHub Action that flags drift in CI, and Rust/Anchor support.
>
> **Impact.** Every protocol with an audit gets a free CI check on their audited surface; bounty hunters get cheaper triage; audit firms get a consistent first pass for re-audits.
>
> **Budget:** $10k (QF rounds: typical ask for a solo dev tool is $5–15k; matching makes small donations go far).
>
> **Proof of work:** [link to GitHub repo] — working PoC + real sample reports included in README.

### Tips for Gitcoin
- QF belønner **bred support**, ikke kun kvalitet: få 10–30 små donasjoner (1–10 DAI/USDC) fra folk du kjenner i crypto-miljøet (Vegard, TechHedge-nettverket, bounty-fellesskapet). 1 DAI donasjon kan bli matchet til ~40x.
- Bygg **i public**: skriv i Twitter/Telegram mens du bygger M1–M2.
- Deltar du i flere runder: samme profil i Builder, oppdater "what we shipped since last round" — re-applikasjoner med progress lykkes oftere enn first-round-søknader.

---

## 3. Superteam Earn (backup)

- https://earn.superteam.fun — løpende grant-runder, opp til ~$100k, lav terskel, ofte Solana-sentrert men også generelle web3-verktøy.
- Samme materiale fungerer; tilpass one-liner.

---

## Aksjonplan (status 2026-11-03)

1. ~~**Opprett GitHub-repo** `auditdrift` (public, MIT)~~ — **FERTIG:** https://github.com/B16mad90/auditdrift (MIT, PoC + 2 sample-rapporter)
2. **ESP Office Hours** — book via hey.xyz/u/ef_esp eller Twitter. Prep: [ESP_OFFICE_HOURS.md](ESP_OFFICE_HOURS.md) (2-min pitch + Q&A, live-demo-kommando).
3. **ESP Direct Grant** — send inn med milestone-budget over.
4. **Gitcoin Builder-profil** — innhold klart i [GITCOIN_BUILDER.md](GITCOIN_BUILDER.md); lag profilen i Builder, søk i neste kvartalsrunde. QF-triks: bygg i public + 10–30 små donasjoner før runden.
5. ~~**Bygg M1** (audit-PDF + storage-layout diff)~~ — **FERTIG** (M1 er i repoet; sample-rapportene viser begge funksjonene)
