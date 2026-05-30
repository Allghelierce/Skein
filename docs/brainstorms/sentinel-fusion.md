# SWARMSHIELD — Self-Healing Drone-Swarm Mesh Defense

> This file previously held an earlier (satellite/fusion) concept that was
> abandoned. The locked concept is below. See `badIDEA.txt` (full outline),
> `potential.txt` (expansion/company), and `CLAUDE.md` (guardrails).

## Concept
A self-healing drone-swarm mesh network that defends its communications from
jamming and cyber attack in real time, driven by a **classic ML** intrusion/
jamming detector trained on real **CIC** network data.

## Context
- Event: Bow Capital × Firestorm hackathon, Track 2 (AI Compute / EE — secure
  mesh networks, RF jamming). Solo, ~1.5 days, one laptop.
- Dual purpose: hackathon demo **and** a data-science portfolio piece (the ML
  model is the centerpiece).
- Sponsor fit: Firestorm builds front-line drone swarms (contested comms); Bow
  funds AI/ML + defense and backs UC (owner is UCSD).

## Three pieces
1. **Swarm (frontend):** drone nodes + links on a command-center map; links go
   green→red under attack→blue as the swarm reroutes. Judge-interactive.
2. **Brain (ML / portfolio):** classic model (Random Forest / XGBoost) trained on
   CIC data; scores live traffic as normal vs attack/jamming.
3. **Battle (action):** attacker jams/hacks a node → ML detects → defender
   reroutes/isolates → swarm survives.

## Hard rules
- Real effects only (no fake numbers / simulation theater).
- RF jamming is simulated as controllable link degradation (real jamming is
  illegal); the mesh routing + self-healing is real code.
- Classic ML, not deep learning. ML is substance, not decoration.
- One laptop. No over-scoping (no K8s/Istio/two-laptop/DL/custom RF hardware).
- Never attack systems you don't own; targets are local/sandboxed.

## Build order (secure the demo first)
0. Get/explore CIC data → 1. train + save the detector (portfolio core) →
2. render swarm map → 3. live message flow between nodes →
4. wire traffic into the model (real-time detection) →
5. attack actions + auto-reroute → 6. judge controls + panels →
7. polish + cached fallback. Keep a working version at every step.
