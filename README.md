# Skein

**A self-healing drone-swarm mesh network that defends itself from jamming and cyber attack — in real time, driven by machine learning.**

> *skein* (n.) — a flock of geese in flight, **and** a length of interwoven thread. A swarm and a mesh, in one word.

Built for the **Bow Capital × Firestorm** hackathon (Track 2: AI Compute / EE — secure mesh networks, RF jamming).

---

## The idea

Autonomous drone swarms rely on constant communication to coordinate, cover for losses, and relay data back to base. On the modern battlefield, the enemy's first move is to **cut that communication** — jamming the radio, hacking a node, or partitioning the network.

**Skein keeps the swarm alive under attack.** A classic ML detector, trained on real network-intrusion data, watches the swarm's traffic and flags jamming/intrusion the instant it happens. The mesh then heals itself — rerouting around dead links and isolating compromised nodes.

## How it works

```
Attack happens  →  ML model detects it  →  swarm reroutes  →  network survives
```

1. **The Swarm** — drone nodes pass messages over a live mesh (real routing + failover).
2. **The Brain** — a classic ML model (Random Forest / XGBoost) trained on real **CIC** intrusion data scores live traffic: normal vs attack/jamming.
3. **The Battle** — attacker jams/hacks a node → the model detects it → the defender reroutes/isolates → the swarm keeps working. Interactive: click any node to attack it and watch the network heal.

## Stack

- **Frontend:** Next.js + TypeScript, Tailwind + shadcn/ui, React Flow (network graph), Framer Motion
- **ML:** classic models (scikit-learn / XGBoost) trained on CIC data, served live
- Runs locally on one laptop

## Honest notes

- **RF jamming is simulated** as controllable link degradation — real RF jamming is illegal (FCC). The mesh routing and self-healing are real code.
- The ML model is the core, not decoration: real data, real feature engineering, real evaluation.

## Status

🚧 In active development for the hackathon. See `badIDEA.txt` (full outline), `potential.txt` (roadmap), and `CLAUDE.md` (project guardrails).
