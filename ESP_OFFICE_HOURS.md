# ESP Office Hours — prep (2-min pitch + Q&A)

**Mål:** få ærlig tilbakemelding før Direct Grant-søknaden. Ikke selge — demonstrere.
**Varighet:** 30 min. Din del: ~5–7 min presentasjon, resten spørsmål.
**Booking:** hey.xyz/u/ef_esp eller via deres X/Farcaster-kontakter. Si at du vil presentere et verktøysporsjekt (post-audit drift scanner) og gjerne ha en evaluering av om det henger med som ESP-direct.

---

## 2-min pitch (les gjennom én gang)

> Hi, I'm [navn], an independent security researcher. I spend a lot of my time on active bug bounties, and one task I do *every single time* I take on a new target is the same:
>
> "Which of these contracts were modified **after** the audit?"
>
> Every audit covers a specific commit. Six months later the repo has moved on, and the bounty scope page says "some contracts were modified after audit — check the git history." So I do it by hand: git log, diff, classify which files are contracts, figure out which changes touch security-critical surface — storage layout, access control, value transfers, proxy upgrades. It takes me hours per repo, and I do this across many targets.
>
> So I built the tool I was missing: **auditdrift**.
>
> *[vis terminalen — kjør live hvis mulig, ellers vis sample-rapporten]*
>
> You point it at a repo and the audited commit, and it produces a ranked report: which contracts changed, a risk score per change, and — this is the part I'm proud of — a **storage-layout diff**. It parses state variables at both commits and tells you if a variable was removed or inserted *before* an existing one. That's the specific bug class that breaks deployed contracts, and it's the kind of finding that wins bounties.
>
> On Alchemix V3 it found **four real storage-layout shifts** since the audit commit — including a strategy that had five state variables removed. Those are exactly the lines I'd have to catch by hand.
>
> It also takes the **audit PDF itself** and cross-references the declared scope against the repo — "of the 8 files this audit covered, 0 changed; of the 24 files that *did* change, here are the 21 high-risk ones."
>
> It's MIT licensed, zero dependencies — Node plus git, runs locally in a second. I want to make it a public good: a GitHub Action that flags post-audit drift in CI for every protocol that has an audit, plus Rust/Anchor support. That's the plan in my grant application — $20k across three milestones, and M1 is already in front of you.
>
> What I'd like from you today: an honest read. Does this fit the direct grant program? What should I fix or reframe before I apply?

---

## Vanlige spørsmål / svar

**"Why should Ethereum care? This is generic dev tooling."**
→ Because it's security tooling for the ecosystem's core workflow: audits. Every protocol that ships post-audit changes has drifted audited surface. The tool makes that drift visible, cheaply, for everyone — hunters, firms, teams. It's the same logic as funding Foundry or Slither: cheap, open, used by all.

**"Is it accurate? Heuristics can miss things."**
→ It's a *triage* tool, not a verifier — it ranks, it doesn't conclude. The storage-layout diff is deterministic, not heuristic. And it's designed to be a first pass that saves hours of manual work, not to replace it. I'll be explicit about that in the docs.

**"What's the adoption plan?"**
→ GitHub Action (M2) — a protocol adds one line to CI and gets an issue opened when audited surface drifts. That's the flywheel: visible output → teams adopt → I see real failure modes → v2. I already know 3–4 protocols where I'd run it the day the Action ships.

**"Why $20k?"**
→ M1 (hardening + tests + docs) $8k, M2 (GitHub Action + Foundry target + multi-audit matrix) $7k, M3 (Rust/Anchor + demo) $5k. I've already spent ~2 weeks of my own time on M1 — the grant funds the parts that turn a PoC into infrastructure.

**"Solo builder risk?"**
→ Real. Mitigation: open source from day one, public roadmap, milestones with public deliverables (repo links, CI demo). The code exists and is verifiable today — that's more than most applications.

**"Any competitors?"**
→ Audit firms sell manual re-audits (expensive, slow). Some repo-internal tooling (Slither etc.) checks *code*, not *audit coverage over time*. Nobody's tool answers "how much of my audited surface has moved?" — that's the gap.

**"What if you get no funding?"**
→ It stays a free open-source tool I use and maintain in the background. The grant accelerates, doesn't gate, the public benefit.

---

## Checkliste før timen
- [ ] Kjør live-demo: `node auditdrift.mjs <alchemix> 8dd21a2 master --audit-pdf <zellic.pdf>` (trenger ~10 sek, vis storage-layout-tabellen)
- [ ] Ha [repo-lenken](https://github.com/B16mad90/auditdrift) klar
- [ ] Skriv en setning om deg selv (bounties du har jobbet med, uten å love inntekt du ikke har)
- [ ] Noter alt de sier — det er råvaren til søknaden
