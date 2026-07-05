# Byeori Engine

**Technical Specification — V4 (Trajectory-Based Alignment)**

Revision: 2026-07-05 · Author: Dohan Park (TEM / The Etched Mutation)
Supersedes: *Byeori Engine Technical Specification* (V2-based edition)

> **Revision note.** The previous English edition documented the V2 scoring model
> (embedding × 0.65 + VAD distance × 0.35). The production engine has since moved to
> V4 trajectory-based alignment. This edition describes the engine **as implemented**
> in `js/core/ByeoriEngine.js` and `js/shared/math.js`, and replaces unverified
> calibration claims with a reproducible simulation study (Section V). Every number
> in this document is either read directly from the production source code or
> produced by the committed simulation script.

---

## I. Introduction

### 1. Problem Context

Interactive systems — games, counseling support tools, educational platforms,
simulations — operate on user choices and responses, yet most reduce user emotion to
a single score, an averaged value, or a one-time survey. Such approaches cannot
capture the fluctuation, wavering, and fixation patterns that emerge across repeated
interactions.

When a user reports a different emotion each time in response to the same stimulus,
repeats similar choices, or lingers at or avoids a specific point, these changes
themselves constitute significant information — yet conventional systems treat them
as noise or average them out.

The Byeori Engine originates from this observation: the core limitation of current
interactive systems is the absence of a structure for handling the **arrangement and
change** of affective responses, rather than their values alone.

### 2. Engine Overview

The Byeori Engine takes as input the emotions, reasons, and temporal interaction
logs reported by the user, and transforms them into structured state indicators. The
engine answers one question:

> *A told a memory. B read that memory and responded. How similar are A's and B's
> experiences?*

It expresses this similarity as a single bounded score (**alignment**, 0–1) together
with categorical context (**bucket**, **transition pattern**, **mismatch type**).
The engine does not diagnose or interpret. Meaning-making, judgment, and
intervention fall outside its role; it functions solely as a layer that computes and
provides state information.

### 3. Scope & Non-goals

**In scope:** structuring logs of reported emotions and reasons; computing
relational indicators between a reader's responses and an author's originals;
tracking response-change trajectories across scenes; providing state information to
host systems.

**Out of scope:** clinical diagnosis or psychological state determination;
therapeutic intervention or behavioral guidance; inference of latent traits;
evaluation of "correct emotions." Responsibility for interpreting the indicators
rests entirely with the host application.

---

## II. Conceptual Foundations

### 1. The Judgment Space: a 17-Anchor Emotion Distribution

All alignment computation operates on a **17-dimensional emotion-anchor
distribution**, not on a dimensional reduction. The anchor set comprises ten
pain-side anchors (fear, sadness, anger, guilt, shame, isolation, numbness, moral
pain, helplessness, despair) and seven recovery-side anchors (joy, hope, relief,
gratitude, love, peace, comfort). A user's report at each scene is a non-negative
weight distribution over these anchors; per-scene similarity is the cosine between
the reader's and the author's distributions. When sentence embeddings are available
on both sides, embedding cosine similarity is used for the per-scene score instead,
with the 17-anchor cosine as the deterministic fallback.

Keeping judgment in the full 17-anchor space is deliberate: collapsing distributions
into two or three dimensions before comparison destroys exactly the compositional
nuance (e.g., guilt-tinted sadness vs. anger-tinted sadness) that the engine exists
to track. Section V.2 quantifies what this costs in practice: scored on VAD
distance, the middle of the behavioral ordering scrambles — trajectory-divergent
and avoidant readers become indistinguishable, and opposition drops to chance-level
separability from noise.

**Provenance and asymmetry of the anchor set.** The 17 anchors are a work-specific
design, not an adoption of a standard taxonomy (basic-emotion or appraisal-based
inventories). They were selected to cover the thematic domain of the host work —
memory, pain, and recovery — with the pain side deliberately finer-grained (10
anchors) than the recovery side (7). This asymmetry has a geometric consequence:
pain-side responses have more room to differentiate under cosine comparison than
recovery-side responses. The asymmetry is an editorial commitment of the host work,
not a psychometric claim; validating the anchor set against established inventories
is an open item (Section V.5).

**Scale heterogeneity caveat.** The two per-scene similarity sources do not share a
scale: sentence-embedding cosines concentrate in a high band, while sparse 17-anchor
cosines floor at 0 for disjoint distributions. Since `level` averages per-scene
scores, a fixed threshold means different things depending on which source produced
them. The simulation in Section V exercises the anchor path only; the embedding
path's bucket distribution is unverified, and normalizing embedding similarity onto
the anchor-cosine scale is an open engineering item (Section V.5).

### 2. VAD Is Visualization-Only

The engine also emits a Valence–Arousal–Dominance (VAD) projection of each response
(`affective_position`), with anchor coordinates calibrated against the affective
norms of Warriner, Kuperman & Brysbaert (2013) and the PAD tradition re-examined by
Bakker & van der Voordt (2014). **This projection is used exclusively for spatial
placement in visualization layers. No alignment, bucket, or pattern decision reads
VAD.** (Earlier engine generations scored on VAD distance; V4 removed VAD from the
judgment path entirely. See Appendix A.)

### 3. Level and Shape: Two Independent Facets of Similarity

The engine's central design commitment is that **the level of emotion and the
dynamics of emotion are distinct, independently informative facets** of an affective
experience.

- **Emotional similarity** — experiencing the same emotion as another person in the
  same situation — is associated with more rewarding interaction, greater empathy,
  and higher interpersonal attunement (Locke & Horowitz 1990; Hatfield et al. 1994;
  Preston & de Waal 2002; Anderson, Keltner & John 2003).
- **Temporal Interpersonal Emotion Systems (TIES)** — Butler (2011, 2017)
  conceptualizes emotion not as an intra-individual state but as an interpersonal
  dynamic system unfolding over time, and shows that emotional *dynamics* predict
  relationship quality independently of emotional *levels*.
- **Emotional convergence** — Anderson, Keltner & John (2003) showed that partners'
  emotional responses converge over time and that this convergence itself predicts
  relationship cohesion.
- **Emotional trajectory analysis** — comparing narratives by their emotional arcs
  is an established methodology (Reagan et al. 2016; Vishnubhotla et al. 2024). V4
  adopts the arc-comparison idea but compares trajectories of emotional *change*
  (deltas), not of absolute values. Extending arc comparison from one-dimensional
  valence curves to cosine similarity over 17-dimensional delta sequences is a
  methodological extension made by this work; the cited studies establish the
  arc-comparison paradigm, not this specific generalization.

V4 implements this dual structure directly: `level` measures how similar the
emotions were, `shape` measures how similarly they *moved*, and the final score is
their product.

### 4. Appraisal Differences Are Observed, Not Extracted

Cognitive appraisal theory (Lazarus & Folkman 1984; Troiano et al. 2023) holds that
the same event — and the same emotion — diverges in meaning depending on how it is
appraised: the same sadness attributed to oneself or to the situation is a different
experience. An earlier engine generation (V3) attempted to *measure* appraisal
directly by having a language model extract attribution labels from free text. This
was abandoned for a methodological reason: validated appraisal instruments in
psychology (e.g., the Stress Appraisal Measure, Peacock & Wong 1990) are self-report
scales, and LLM label extraction has no established reproducibility as a measurement
instrument.

V4 instead observes the **consequence** of appraisal differences. Two people who
feel the same emotion for different reasons respond differently at the *next* scene:
the one who felt "it was my fault" moves toward guilt; the one who felt "it was
their fault" moves toward anger. Diverging trajectories reveal — indirectly, and
without any label extraction — that the appraisals differed. This removes the
unvalidated measurement instrument from the scoring path entirely.

---

## III. Engine Design & State Information

### 1. Input Layer

The engine treats user reports and interaction logs as raw input and does not
evaluate their veracity or desirability. Per step (scene), the inputs are:

- **User vector** — the reader's 17-anchor emotion distribution for the current
  scene (optionally with a text embedding and a reason analysis carrying `is_void`,
  `attribution`, `target`).
- **Original vector** — the author's recorded distribution for the same scene.
- **Trajectories** — the reader's emotion vectors over all previously visited
  scenes, and the author's originals **re-ordered to the reader's visit order**.
- **Scene scores** — per-scene similarity scores accumulated so far.
- **Context** — previous bucket (for hysteresis) and recent emotion history (for
  fixation detection).

### 2. Output Interface

One call returns one snapshot:

| Field | Content |
|---|---|
| `alignment_score` | 0–1 continuous alignment |
| `alignment_bucket` | HIGH / MID / LOW / FIXATED |
| `transition_pattern` | echo_follow / bridge / contradiction / displacement / avoidance / fixation |
| `mismatch_type` | void_mismatch / attribution_mismatch / target_displacement / emotion_mismatch / null |
| `current_scene_score` | this scene's similarity |
| `affective_position` | VAD projection — visualization only |
| `debug` | full formula trace (`L × S × V = alignment`), per-axis values, fixation level |

The interface is **non-diagnostic** (no fields implying psychological state),
**composable** (indicators usable individually or together), and
**non-prescriptive** (no recommendations). The `debug.formula` string exposes the
complete computation of every score — the engine's judgment is auditable at every
step.

---

## IV. Alignment Mechanics (V4)

### 1. The Formula

```
scene_score = cos(user_i, original_i)            // 17-anchor space (or embedding)
level       = mean(scene_scores so far)
shape_raw   = (scenes ≥ 3)
              ? cos(flatten(Δuser), flatten(Δoriginal))
              : 1.0
shape       = max(0, shape_raw)
void_mod    = (user void ∧ author not void) ? 0.7 : 1.0

alignment   = clamp01( level × shape × void_mod )
```

**Delta trajectories.** If reader B visits scenes in order [3, 1, 4], B's trajectory
is her reactions in that order and A's counterpart trajectory is A's originals
re-ordered to [3, 1, 4]. Deltas are successive differences; `shape_raw` is the
cosine between the two flattened delta sequences. Visit order is preserved because
in TEM, *which scene one opens first is already an act of interpretation* —
re-sorting to canonical order would score an imaginary, linearized reading instead
of the actual one.

**Why multiplicative.** A linear combination lets one axis compensate for another:
under V3's weighted sum, two people with *opposite* emotions could still approach a
HIGH score if an auxiliary label happened to match. Multiplication structurally
forbids cross-axis compensation: similar emotions moving in opposite directions
score low, and similar movement over dissimilar emotions scores low. This encodes
the system's core premise — "the same emotion for a different reason is a different
experience" — and its converse.

**Why shape is clamped at 0.** Negative delta-cosine means anti-correlated movement.
Permitting negative alignment would require a defined concept of "anti-alignment,"
which the current model does not claim; opposite movement is scored as very low
alignment (0) and surfaced narratively as the *contradiction* pattern instead.

**Why shape = 1.0 below three scenes.** Shape needs at least two deltas. Setting it
to 1.0 makes `alignment = level × void_mod` in the early scenes — a provisional,
level-only estimate — and keeps the entire play covered by a single formula. The
`shape_active` debug flag marks this state.

**Why VOID is a modifier, not an axis.** In the V3 three-axis model the "attitude"
axis sat at a constant 0.7 for most plays — a bias term masquerading as an axis. V4
demotes it to a conditional multiplier: it acts only when the reader withholds
emotional input (VOID) while the author exposed theirs (×0.7), and is inert (×1.0)
otherwise. A very high score can survive the penalty in the MID range — leaving open
that silence, too, can be an answer.

The modifier is deliberately one-sided. If the author withheld while the reader
reports, or both withheld, the modifier stays at ×1.0: a reader is never penalized
for meeting the author's silence, and matched silence is treated as resonance, not
absence. In all cases the per-scene similarity is still computed against the
author's recorded emotion distribution, which exists independently of the VOID flag;
the flag additionally surfaces as `void_mismatch` whenever exactly one side
withheld.

**Reader-VOID scene scores.** The production host reaches reader-VOID through two
paths, and the spec is explicit about both. (1) *Silent lapse* (timeout without
input): the reader vector is all-zero; the cosine guard returns 0 for a
zero-magnitude vector, so the scene contributes `scene_score = 0` to the `level`
mean **and** the ×0.7 modifier applies — withholding entirely is a deliberate
double penalty, costing both the emotion channel and the attitude modifier. The
scene is not dropped from the mean, so `level` cannot be defended by strategic
silence. (2) *Declared void* (emotions entered, then marked unsaid): the score is
computed on the entered distribution as usual, with the ×0.7 modifier on top.

### 2. Buckets (production values)

| Rule | Value |
|---|---|
| HIGH | alignment ≥ 0.50 |
| LOW | alignment < 0.10 |
| MID | otherwise |
| HIGH retained (hysteresis) | alignment ≥ 0.40 while previously HIGH |
| LOW retained (hysteresis) | alignment ≤ 0.15 while previously LOW |
| FIXATED (takes precedence) | mean pairwise cosine of the last 3 user vectors ≥ 0.85 |

Buckets are processing intervals, not psychological states. Hysteresis prevents
flicker at the boundaries: a reader who reached HIGH is not demoted by a single
weaker scene. FIXATED is detected from **pattern persistence** — sustained
similarity of the reader's own recent vectors — not from a repetition count, and it
overrides the score-based bucket when present.

### 3. Transition Patterns

Patterns are derived alongside the score and do not feed back into it. The host
application (TEM) uses them for narrative branching geometry and staging; the engine
only reports them.

| Pattern | Trigger (production logic) | Reading |
|---|---|---|
| fixation | FIXATED bucket | stuck on one emotion |
| displacement | level ≥ 0.5 ∧ shape < 0.3 (≥ 3 scenes) | similar emotions, diverging paths |
| echo_follow | HIGH bucket | following like a reverberation |
| bridge | MID bucket (or unclassified LOW) | neutral connection |
| avoidance | LOW ∧ void mismatch | evading emotional contact |
| contradiction | LOW ∧ emotion/attribution mismatch | moving against |
| displacement (late) | LOW ∧ target displacement | same feeling, moved target |

A caution inherited from the V4 design record: *displacement* detects trajectory
divergence, not its cause. Whether the divergence stems from appraisal differences
or from noise (extraction jitter, ambiguous scene text, timing) is outside the
engine's discriminative power, and downstream layers must present it as observation,
not verdict.

An analogous caution applies to *contradiction*: the trigger is "low alignment plus
emotion/attribution mismatch," which uncorrelated noise satisfies almost as readily
as deliberate opposition (Section V, Observation 3). The label's semantics —
"moving against" — overstate the engine's actual discriminative power; downstream
layers should treat contradiction as *disconnection with mismatched emotion*, not
as verified antagonism.

### 4. Mismatch Types

Orthogonal to the score, the engine tags *how* the current scene's reports differ:
`void_mismatch` (one side withheld), `attribution_mismatch` (different attributed
cause), `target_displacement` (similar emotion, different target — requires emotion
cosine ≥ 0.5), `emotion_mismatch` (emotion cosine < 0.5). Tags are narrative
material only; they never modify the score.

---

## V. Simulation-Based Verification (Reproducible)

### 1. Method

The bucket thresholds and pattern boundaries above were examined with a synthetic
playthrough simulation executed **directly against the production module** (the
script imports `js/core/ByeoriEngine.js`; no formula is re-implemented). Two scoping
statements up front. First, the production thresholds were **not** tuned on this
simulation — they predate it, set from analytic estimates of the multiplicative
score distribution, with re-tuning deferred to human pilot data. This study
therefore *verifies discriminative behavior*; it is a mechanical sanity check plus a
baseline comparison, not a calibration. Second, the archetypes are generated in the
same 17-anchor space the engine scores in, so agreement between design intent and
engine output confirms that the formula implements its specification — it cannot,
by construction, prove the specification psychologically correct (Section V.5).

The study is fully deterministic and committed to the repository:

- Script: `tools/byeori_sim_verification.mjs` · Raw results: `docs/paper/byeori_sim_results-260705.json`
- PRNG: mulberry32, **seed 20260705** — identical output on every run
- **10,500 playthroughs**: 7 behavioral archetypes × 1,500 runs, 3–8 scenes each
- Author trajectories: sparse random walks over the 17-anchor simplex (2–4 active
  anchors per scene, frequent emotional turns, matching the dramaturgy of TEM key
  scenes)

The seven archetypes model qualitatively distinct reader behaviors: **resonant**
(follows the author closely), **partial** (half personal bias), **divergent**
(shares each scene's dominant emotion but moves independently — the displacement
probe), **contradiction** (moves against the author), **random**, **avoidant**
(emotionally distant, ~50% VOID), **fixated** (one emotion regardless of scene).

A scoping note on VOID: the avoidant archetype always reports an emotion vector
alongside its VOID flag — it models the *declared-void* path (Section IV.1), not
the silent-lapse zero-vector path, which this simulation does not exercise. The
baseline scorers below have no VOID handling at all and score the reported vectors
as-is; avoidant rows therefore compare emotion-channel behavior only.

### 2. Results

Final-step alignment by archetype (n = 1,500 each):

| Archetype | mean | median | p5–p95 | dominant bucket | dominant final pattern |
|---|---|---|---|---|---|
| resonant | 0.849 | 0.858 | 0.749–0.923 | HIGH 93.7% | echo_follow 93.7% |
| partial | 0.439 | 0.442 | 0.266–0.600 | HIGH 45.5% / MID 37.7% | echo_follow / bridge |
| divergent | 0.374 | 0.390 | 0.065–0.597 | MID 46.4% | bridge 41.4% |
| avoidant | 0.099 | 0.087 | 0.002–0.233 | FIXATED 77.1% | fixation 77.1% |
| contradiction | 0.015 | 0.000 | 0–0.080 | LOW 91.6% | contradiction 69.0% |
| random | 0.016 | 0.001 | 0–0.074 | LOW 98.1% | contradiction 86.3% |
| fixated | 0.012 | 0.000 | 0–0.055 | FIXATED 83.2% | fixation 83.2% |

**Baseline comparison.** The same 10,500 playthroughs were scored by two historical
scorers alongside V4: **V1** (mean per-scene 17-anchor cosine — level without shape
or void) and **V2's affective channel** (mean per-scene VAD-distance similarity,
exponential decay k = 3). V2's semantic channel requires text and cannot be honestly
simulated on synthetic emotion data, so only its affective half is compared; that is
the half that placed VAD in the judgment path. HIGH% = share of runs with final
score ≥ 0.50.

| Archetype | V1 mean (HIGH%) | V2-affective mean (HIGH%) | V4 mean (HIGH%) |
|---|---|---|---|
| resonant | 0.964 (100%) | 0.896 (100%) | 0.849 (99.9%) |
| partial | 0.715 (99.9%) | 0.752 (99.9%) | 0.439 (28.0%) |
| divergent | 0.736 (100%) | 0.675 (99.5%) | 0.374 (19.7%) |
| avoidant | 0.438 (25.7%) | 0.664 (93.3%) | 0.099 (0.1%) |
| contradiction | 0.297 (5.4%) | 0.536 (64.5%) | 0.015 (0%) |
| random | 0.229 (0.6%) | 0.557 (78.1%) | 0.016 (0%) |
| fixated | 0.201 (3.3%) | 0.524 (56.7%) | 0.012 (0%) |

(HIGH% here is threshold-only, without bucket hysteresis, to keep the three scorers
comparable; the bucket table above includes hysteresis and FIXATED precedence. The
resonant gap — 99.9% threshold-only vs 93.7% bucket-HIGH — is almost entirely
FIXATED precedence, the 6.3% flagged in Observation 7.)

**Threshold-free separability (AUC).** Because a fixed 0.50 threshold could flatter
V4 and punish scorers calibrated to other scales, pairwise AUC — the probability
that a playthrough from the first archetype outranks one from the second under a
given scorer, independent of any threshold — is reported for the informative pairs:

| Pair (should rank first > second) | V1 | V2-affective | V4 |
|---|---|---|---|
| resonant vs random | 1.000 | 1.000 | 1.000 |
| resonant vs divergent | 1.000 | 1.000 | 0.999 |
| partial vs random | 1.000 | 0.960 | 1.000 |
| divergent vs partial (design: divergent *below*, AUC < 0.5 desired) | 0.605 | 0.210 | 0.376 |
| contradiction vs random (no scorer should — see Obs. 3) | 0.675 | 0.442 | 0.430 |

**Pattern firing-rate matrix (any-step).** Percentage of runs per archetype in
which each pattern fired at **any** step. Patterns are not mutually exclusive
across the steps of a run, so rows sum past 100% — this is a firing-rate matrix,
not a strict confusion matrix. The designed-for cell reads as recall; other cells
in the same column read as false-positive rates:

| Archetype ↓ / Pattern → | echo_follow | bridge | contradiction | displacement | avoidance | fixation |
|---|---|---|---|---|---|---|
| resonant | **100** | 0.1 | 0 | 0 | 0 | 17.6 |
| partial | 99.9 | 46.0 | 0 | 4.9 | 0 | 34.3 |
| divergent | 100 | 47.9 | 0 | **35.7** | 0 | 33.4 |
| contradiction | 11.2 | 71.7 | **93.9** | 8.2 | 0 | 18.0 |
| random | 12.1 | 72.7 | 97.9 | 1.4 | 0 | 0 |
| avoidant | 24.7 | 92.4 | 19.3 | 13.9 | **30.4** | 81.1 |
| fixated | 10.7 | 36.1 | 90.2 | 5.7 | 0 | **83.2** |

### 3. Observations

1. **The score separates behaviors cleanly.** Mean alignment orders the archetypes
   exactly as designed (0.849 ≫ 0.439 ≈ 0.374 ≫ 0.099 ≫ ~0.015), and random input
   floors at ≈ 0 (98.1% LOW) — the engine does not reward noise.
2. **What the baselines fail at is decomposable — and the two failures differ.**
   All three scorers rank-separate the extreme pairs perfectly (AUC 1.000 for
   resonant vs random), so the baselines' HIGH% failures are **operating-point
   failures, not rank failures**: V2-affective passing 78.1% of random playthroughs
   at 0.50 is primarily *scale compression* — exponential distance decay maps even
   unrelated VAD positions to ≈0.55 — and could be partially repaired by
   re-thresholding. What cannot be re-thresholded away is the **mid-band
   scrambling**: on divergent vs partial, where the design intent is divergent
   *below* partial (AUC < 0.5), V1 ranks divergent *above* partial (0.605 —
   rewarding shared dominant emotion while blind to trajectory), and V2-affective
   collapses divergent and avoidant into overlapping bands (means 0.675 vs 0.664)
   while dropping opposition to chance-level separability from noise (0.442). V4
   is the only scorer that both orders divergent below partial (0.376) and holds
   the extreme pairs at ≈1.0. This — not the threshold table alone — is the
   empirical case for multiplicative shape and for removing VAD from the judgment
   path.
3. **Contradiction does not distinguish opposition from noise.** The firing-rate
   matrix shows *random* triggering contradiction more often (97.9%) than the
   archetype designed for it (93.9%), and fixated at 90.2%; at the score level, V4's
   contradiction-vs-random AUC is 0.430 — chance. Once both behaviors floor at
   alignment ≈ 0 with mismatched emotions, the engine cannot tell "moving against"
   from "uncorrelated." The pattern's caveat in Section IV.3 and the candidate
   revision in V.5 (gating on the *sign* of delta correlation, which `shape_raw`
   already exposes) follow from this.
4. **Displacement is narrow but clean.** It requires the conjunction *level ≥ 0.5 ∧
   shape < 0.3*; even a probe built for it crosses that boundary at some step in
   only 35.7% of runs — but its false-positive rate stays at or below 8.2% in every
   other archetype. Displacement is a rare, high-precision signal, not a frequent
   classification.
5. **Avoidance has perfect precision and low recall.** It fired in 30.4% of
   avoidant runs and in 0% of all 9,000 non-avoidant runs. Sustained avoidance is
   instead absorbed by FIXATED (81.1% any-step, 77.1% final): because FIXATED takes
   precedence and *avoidance* additionally requires a LOW score, a reader who keeps
   withholding while hovering near their own unchanged position is reported as
   fixated. The `void_mismatch` tag still marks the withholding independently, so
   hosts can separate the two — but the pattern-level overlap is documented as an
   open question (V.5).
6. **Any-step echo_follow is inflated by the provisional window.** echo_follow
   fired at some step in ≈100% of all engaged archetypes — an artifact of the first
   two scenes, where shape = 1.0 makes alignment provisionally level-only and easily
   HIGH. Final-step patterns (bucket table above) are the reliable read; the
   interaction of hysteresis with the provisional window is an open question (V.5).
7. **Fixation detection is sensitive to low-velocity trajectories.** In an earlier
   simulation round with slower-moving author trajectories, even faithful followers
   triggered FIXATED in 12.9% of runs (6.3% with dramaturgically realistic turns);
   any-step false-positive rates remain 17.6–34.3% for engaged archetypes. Content
   with little emotional movement will inflate FIXATED; authors and host systems
   should be aware of this coupling.

### 4. Limits of This Verification

Synthetic archetypes validate **internal mechanics** — that the formula and
thresholds discriminate the behavior classes they were designed to discriminate,
and that they do so better than the historical scorers on identical inputs. Because
the archetypes are generated in the engine's own representation space, this is
evidence of correct implementation and of internal discriminative structure — not
evidence that the structure corresponds to human experience. The planned human
study (a 10-participant pilot correlating alignment with post-play self-reported
resonance, per the V4 design record) is **directional only**: at n = 10 a
correlation estimate has no meaningful statistical power and can indicate sign and
rough magnitude at best. Until a properly powered study is run, the engine's claims
are mechanical, not psychological.

### 5. Open Design Questions

Documented candidate revisions surfaced by this verification; none is applied
without a deliberate design decision, since each trades against a current
commitment.

1. **Level recency.** `level` is an unweighted mean: in an 8-scene play, a complete
   divergence at scene 7 carries 1/8 weight, and HIGH hysteresis further cushions
   it. Candidate: exponential recency weighting. Trade-off: the current mean treats
   the whole visit as one accumulated reading rather than privileging the ending.
2. **FIXATED precedence collapses an orthogonal signal.** Score-based buckets and
   self-similarity are independent measurements, but the bucket label lets FIXATED
   overwrite HIGH, so "resonant *and* stuck" is inexpressible at the label level.
   The information is not lost — `debug.fixation_level` is exposed separately, and
   hosts needing both dimensions should read it — but promoting fixation to a
   first-class boolean alongside the bucket would be the cleaner interface.
3. **Avoidance/fixation overlap.** See Observation 5. Candidate: evaluate the void
   mismatch before the FIXATED override, or expose avoidance as a flag independent
   of the LOW gate.
4. **Hysteresis during the provisional window.** HIGH reached while `shape_active`
   is false (fewer than 3 scenes) can be retained by hysteresis after shape
   activates. Candidate: suspend hysteresis until `shape_active` is true.
5. **Embedding scale normalization.** See Section II.1. Candidate: map embedding
   cosine onto the anchor-cosine scale before it enters `level`, and re-run this
   verification through the embedding path.
6. **Contradiction vs. disconnection.** See Observation 3. The current trigger
   conflates anti-correlated movement with uncorrelated noise. Candidate: gate the
   *contradiction* label on the sign of the delta correlation (`shape_raw < 0`,
   already computed and exposed in debug output), and report near-zero correlation
   with mismatched emotion as a separate *disconnection* state. Trade-off: adds a
   seventh pattern to the host vocabulary.

---

## VI. Aggregate Observation Layer (Optional)

*Naming note: earlier editions called this layer "Strata." In the TEM application,
"strata" now names the 3D terrain view; to avoid collision, the aggregate layer is
renamed here.*

When the engine runs across many sessions or users, individual trajectories form
aggregate structures. This optional consumer layer summarizes them without extending
the engine's judgment: **density** (concentration of trajectories per bucket
interval), **deviation** (variance across trajectories for the same stimulus),
**void ratio** (frequency of withheld input at a point), **erosion** (decay of
HIGH/MID density over time).

The layer does not average individuals into a single value, does not typify users,
and does not determine normality. Aggregate data is handled only in anonymized form
and never used as the basis for individual user feedback. Visualization is a further
separate layer: the engine computes, aggregation summarizes, representation is the
host's choice.

---

## VII. Usage Scenarios

Illustrative, not prescriptive — the engine provides response structure; meaning and
strategy belong to the host.

- **Games & interactive fiction:** alignment change toward characters or events;
  bucket distributions across repeated choices; branching density modulated by
  response structure (the engine never suggests what the player should feel).
- **Reflection & counseling support:** temporal records of reported emotion and
  reason; trajectory summaries as reference material for professionals. The engine
  does not perform therapy and does not replace clinical judgment.
- **Education & simulation:** shifts in affective response across repeated attempts;
  VOID-signal accumulation at specific stages — never as an evaluation of ability.
- **Research & system design:** comparing response trajectories across interface
  variants; examining what response structures a system induces.

---

## VIII. Limitations & Ethical Considerations

1. **Expressive limits.** The engine operates on reported input only. Non-verbal
   expression is not included; unreported emotion is not computed; a 17-anchor
   distribution does not capture all affective nuance. These are intentional scope
   restrictions, not accidents.
2. **Interpretation is separated from computation.** All outputs are descriptive.
   Buckets and patterns are summary signals of observed arrangements — never
   determinations of psychological state, evaluations of behavior, or suggestions of
   desirable responses.
3. **Misuse prevention.** No output field carries clinical implication; no user is
   summarized by a single score; pattern labels are observational, not states. The
   engine must not be the sole basis for automated decision-making in treatment,
   educational evaluation, or legal/administrative contexts.
4. **Privacy.** Affective input is sensitive: minimal collection, session-level
   isolation, anonymized aggregation. Retention and access policy is the host
   system's responsibility.
5. **Premises for use.** The engine does not define a person, does not correct
   emotions, does not direct choices. Meaning-making always happens outside.

---

## IX. Parameters (production values)

| Parameter | Value | Location |
|---|---|---|
| VOID penalty | ×0.7 | `ByeoriEngine.calculateStep` |
| HIGH threshold | 0.50 (hysteresis hold 0.40) | `math.getBucket` |
| LOW threshold | 0.10 (hysteresis hold 0.15) | `math.getBucket` |
| FIXATION threshold | 0.85 (pairwise cosine, last 3) | `math.calculateFixationLevel` |
| Shape clamp | max(0, cos) | `math.calculateShapeSimilarity` |
| Shape activation | ≥ 3 scenes | same |
| Displacement gate | level ≥ 0.5 ∧ shape < 0.3 | `ByeoriEngine._getTransitionPattern` |

The engine is a parameterized structure: thresholds are expected to be re-tuned when
the planned human pilot provides distribution data.

---

## Appendix A. Version History

| Version | Model | Why it was replaced |
|---|---|---|
| V1 | single emotion-vector cosine | could not express "same emotion, different reason" |
| V2 | embedding cos × 0.65 + VAD distance × 0.35 | embeddings conflate emotion with its reason; VAD in the judgment path collapses nuance |
| V3 | emotion 0.4 + reason 0.4 + attitude 0.2 (linear) | LLM label extraction unvalidated as an instrument; low-resolution discrete matching; linear compensation between axes; attitude axis a de-facto constant |
| **V4** | **level × shape × void_mod (multiplicative)** | current — measures the *consequence* of appraisal difference via trajectory divergence |

V2's historical design drew on Mendes & Martins (2023) for embedding-based affect
similarity and Zhao et al. (2022) for VAD distance decay; both components were
removed from the judgment path in V4 (embeddings remain as an optional per-scene
similarity source; VAD remains visualization-only).

## Appendix B. Reproducing the Verification

```
node tools/byeori_sim_verification.mjs
# writes docs/paper/byeori_sim_results-260705.json (seed 20260705, deterministic)
```

---

## References

1. Warriner, A. B., Kuperman, V., & Brysbaert, M. (2013). Norms of valence, arousal,
   and dominance for 13,915 English lemmas. *Behavior Research Methods*, 45(4).
2. Bakker, I., & van der Voordt, T. (2014). Pleasure, Arousal, Dominance: Mehrabian
   and Russell revisited. *Current Psychology*, 33(4).
3. Butler, E. A. (2011). Temporal interpersonal emotion systems: The "TIES" that
   form relationships. *Personality and Social Psychology Review*, 15(4).
4. Butler, E. A. (2017). Emotions are temporal interpersonal systems. *Current
   Opinion in Psychology*, 17.
5. Anderson, C., Keltner, D., & John, O. P. (2003). Emotional convergence between
   people over time. *Journal of Personality and Social Psychology*, 84(5).
6. Lazarus, R. S., & Folkman, S. (1984). *Stress, Appraisal, and Coping*. Springer.
7. Troiano, E., et al. (2023). Dimensional modeling of emotions in text with
   appraisal theories. *Computational Linguistics*, 49(1).
8. Peacock, E. J., & Wong, P. T. P. (1990). The Stress Appraisal Measure (SAM).
   *Stress Medicine*, 6(3).
9. Reagan, A. J., et al. (2016). The emotional arcs of stories are dominated by six
   basic shapes. *EPJ Data Science*, 5(1).
10. Vishnubhotla, K., Hammond, A., Hirst, G., & Mohammad, S. M. (2024). The emotion
    dynamics of literary novels. *Findings of the Association for Computational
    Linguistics: ACL 2024*, 2557–2574.
11. Locke, K. D., & Horowitz, L. M. (1990). Satisfaction in interpersonal
    interactions as a function of similarity in level of dysphoria. *Journal of
    Personality and Social Psychology*, 58(5).
12. Hatfield, E., Cacioppo, J. T., & Rapson, R. L. (1994). *Emotional Contagion*.
    Cambridge University Press.
13. Preston, S. D., & de Waal, F. B. M. (2002). Empathy: Its ultimate and proximate
    bases. *Behavioral and Brain Sciences*, 25(1).
14. Mendes, G. A., & Martins, B. (2023). Quantifying valence and arousal in text
    with multilingual pre-trained transformers. *Advances in Information Retrieval
    (ECIR 2023)*, LNCS 13980, Springer. *(historical basis, V2)*
15. Zhao, Y., et al. (2022). Evaluating users' emotional experience based on the PAD
    emotion model. *Frontiers in Psychology*. *(historical basis, V2)*
