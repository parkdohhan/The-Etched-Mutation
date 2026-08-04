# The Etched Mutation (TEM)

**An interactive system and a research program around one question:**

> **"If memory has no original — only variants — can that be measured?"**

Not a metaphor. A working web system, a formal framework, and pre-registered, reproducible experiments — built and run by one person since January 2026.

*Dohhan Park — independent researcher. Computational cognition × narrative × interactive media.*

---

## 30-second version

- **A working system.** A web-based interactive narrative where the player's *emotional trajectory* — not branching choices — drives navigation. Choices record emotional texture only; there is no `next_scene_id` anywhere in the schema, by design.
- **A measurement engine.** Byeori Engine V4 scores alignment between a player's emotional trajectory and the teller's initial telling trajectory (`alignment = level × shape × void_mod`). The engine observes and reports; it never judges or recommends.
- **A research program.** Two tracks, kept deliberately separate: a system/metrics paper (Track A) and a formalization of "no original" via cellular sheaf theory (Track B). Unvalidated grand theory is excluded from the system paper on principle.
- **A methods rule.** Thresholds, null models, and go/no-go criteria are fixed **before** data collection. Limitations are stated in the papers, not hidden.

## Research tracks

### Track A — System & metrics (typeset, 48-reference bibliography)

**"Measuring Emotional Trajectory Divergence in Interactive Narrative: The Etched Mutation System and Its Metrics"**
→ [`docs/paper/TrackA_TEM_system_paper_typeset-260717.pdf`](docs/paper/TrackA_TEM_system_paper_typeset-260717.pdf)

- Emotion as a 17-anchor distribution (never collapsed to a single label); VAD used for visualization only, never for scoring.
- Contamination modeled as **directional, per-axis** state (divergence / convergence / heterogeneity + depth) — a render-control signal, not a truth claim.
- Engine verification: **10,500 seeded playthroughs** (7 behavioral archetypes × 1,500 runs, fixed PRNG seed — identical output on every run), scored against two historical baseline scorers. Raw results in [`docs/paper/byeori_sim_results-260705.json`](docs/paper/byeori_sim_results-260705.json).

### Methods companion — Simulated Readers

**"Simulated Readers for Affective Interactive Narrative: Pre-Validation through Stratified Sampling of Empirical Personality Distributions"**
→ [`docs/paper/persona-sim_paper_typeset-260717.pdf`](docs/paper/persona-sim_paper_typeset-260717.pdf)

- Persona personalities are **sampled from 307,313 real IPIP-NEO-300 respondents** (stratified, 15 strata), not imagined by an LLM — avoiding persona mode collapse.
- Trait labels are suppressed at generation time; personas are built from concrete life events only.
- The tool's limits are measured and reported: LLM readers over-resonate (ceiling bias) and cannot simulate empathy failure — an asymmetric limitation stated as a finding.

### Track B — The computability of "no original" (pre-registered formalization)

Reframes memory/textual variance via **cellular sheaf theory**: whether an "original" exists becomes a computable question — discrepancy energy = 0 ⟺ a consistent global section exists.
→ [`docs/paper/TrackB_이본론_층모델_논문원고_v0.1-260716.md`](docs/paper/TrackB_이본론_층모델_논문원고_v0.1-260716.md)

- **Pre-registered:** all decision criteria (§5) were frozen before main-experiment data collection.
- Pilot (39 simulated runs, LLM personas): cyclic-component ratio **ρ = 0.18** vs. the "original exists" null — 0 of 1,000 resamples exceeded it (p < 0.001). Instrument self-validation: returns ρ ≈ 0 on a synthetic world with a true original, and localizes a planted cyclic twist at ρ ≈ 0.999.
- Honest verdict, in the paper's own words: **weak-go** — the runs are simulations, not humans; one decision-axis exhibit sits on the null boundary. The number that argues against the theory is reported alongside the one that supports it.
- Companion experiments E1/E2 (cut-inversion: where can a memory be cut without semantic damage?) with equipment, data, and reports under [`docs/`](docs/).
- Target venues: ICIDS → applied-math collaboration (on GO), or Leonardo-class theory essay (on NO-GO). The genre branch is explicitly pre-committed.

## The system, briefly

| | |
|---|---|
| Stack | Vanilla ES6 JavaScript, Supabase (Auth/DB/Realtime/Edge Functions), Three.js, Web Audio API |
| Navigation | Trajectory engine computes accessible scenes each turn; transition patterns shift the *center* of the accessible region, not just its radius |
| Player view | Fog — local, partial. Author view: full emotional-space map. Asymmetry is a design principle |
| Record = first Play | Narrating a memory is its first traversal; the system stores a *telling trajectory*, not an "original" |
| Terrain | Player trajectories erode and deposit a shared 3D strata landscape (`tem_variant_strata.js`) — variance as geology, not decay |

## Repository map

```
js/                 engine + app modules (ByeoriEngine, SceneNavigator, ContaminationTracker, tem_variant_strata)
docs/paper/         typeset papers (Track A, Simulated Readers), Track B manuscript, raw sim results
docs/               design documents, frozen theory documents, experiment reports (Korean)
tools/              persona-sim pipeline and verification scripts
supabase/           schema migrations and edge functions
index.html          the work itself (PLAY / RECORD / ARCHIVE)
```

Working documents and papers are in Korean (papers carry English titles); code is in English. Root-level PNG files are development screenshots.

## Contact

Dohhan Park — [@dohhan_](https://instagram.com/dohhan_)
