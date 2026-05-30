# Project: Skein

A 1.5-day SOLO defense-hackathon project for the **Bow Capital x Firestorm** hackathon (Track 2: AI Compute / EE — secure mesh networks, RF jamming). It is also the owner's **data-science portfolio piece**.

**What it is:** a self-healing drone-swarm mesh network that defends itself from cyber attacks and jamming in real time, driven by a **classic ML** intrusion/jamming detector trained on real **CIC** network data. Stack: **Next.js + TypeScript** frontend, **classic ML** (Random Forest / XGBoost) brain. Runs locally on one laptop. See badIDEA.txt for the full outline and potential.txt for the expansion roadmap.

## What future Claudes SHOULD do
- Keep it **flashy AND genuinely functional** — real working code, not narration.
- Treat the **ML model as the core** (it's the portfolio piece): real CIC data, real feature engineering, real evaluation (precision/recall, confusion matrix, ROC, feature importance). Classic ML only — NOT deep learning.
- Build in **"secure the demo first" order**: working floor before fancy additions.
- Keep **judge-interactive levers** (click to jam/hack a node) — they prove it's real.
- Tailor to the sponsors: **drone swarms (Firestorm), AI/ML + defense (Bow)**.

## What future Claudes should NOT do
- **No fake/hardcoded numbers or simulation theater** (the rejected original idea did this — fake SINR/BER). Effects must come from real state.
- **No actual RF jamming** — it's illegal (FCC). Jamming is *simulated* as controllable link degradation; say so honestly. The mesh routing/self-healing must be real.
- **Never attack systems you don't own.** Targets are local/sandboxed only.
- **No over-scoping** — no Kubernetes, Istio, two-laptop networking, or deep-learning rabbit holes. Solo, 1.5 days.
- **Don't bolt on data as decoration** — the ML must be the substance, not a checkbox.

## Commit & branch conventions (ALL contributors, human or agent)
- Commit messages are **all lowercase**, unless uppercase is needed to clarify or represent something (e.g. `CIC`, `WebSocket`, a class name).
- Messages contain ONLY a plain description. **No `Co-Authored-By` trailer. Never mention Claude, AI, or any assistant** anywhere in a commit.
- Author identity comes from the contributor's own `git config user.name`/`user.email`.
- **Commit incrementally** — commit after each logical step in the plan, not one big commit at the end. Small reviewable diffs.
- **Push to your own branch after committing** (each worktree → its own branch). Do not commit into another worktree's branch.
