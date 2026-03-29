# The Etched Mutation (TEM) — Claude Code Context

## What This Project Is

TEM is a web-based immersive theater that visualizes how human memories become contaminated and transformed through others' interpretations. It is not a memory preservation tool — it is a system for experiencing how memories degrade, distort, and evolve when shared.

Core question: "당신의 음각은 어디에 새겨져 있는가?" (Where is your intaglio etched?)

**Creator:** Dohan Park (@dohhan_)
**Stack:** Vanilla ES6 JS, Supabase (Auth + DB + Realtime + Edge Functions), Three.js, Web Audio API

## Current Menu Structure

- **PLAY** — Browse archive, select a memory, traverse its scenes with emotion input
- **ARCHIVE** — Memory list view (currently same entry point as PLAY)
- **RECORD** — AI conversation ("Another Me") → scene extraction → emotion/reason burial
- **PROFILE** — User info, session history, received messages
- **PORTFOLIO** — Creator info

**Note:** There is NO live 2-player mode in the current menu. Live mode UI exists in HTML but is not connected.

## Theoretical Framework: 기억유전학 (Mnemonic Genetics) v0.3

Six operations of memory transformation:

1. **Destructive Replication** — Recall overwrites original. R(M) = M', M is gone.
2. **Biased Mutation** — Emotion/context/social pressure direct mutation. ΔM = f(e,c,s)
3. **Intentional Selection** — Conscious curation of what to share/hide
4. **Ruleless Translation** — No fixed codebook for experience→language conversion
5. **Aberrant Repair** — Attempts to restore create new distortions (convergence→divergence)
6. **Mnemonic Recombination** — Memories cross-contaminate (inter-engram operation)

See `docs/기억유전학_v0.3.md` for full paper.

## Core Engine: 별이엔진 V4 (Byeori Engine)

File: `js/core/ByeoriEngine.js`

```
alignment = level × shape × void_mod

level     = mean(scene_scores)           // emotion similarity per scene
shape     = cosine(delta_user, delta_original)  // trajectory similarity (3+ scenes)
void_mod  = 0.7 if user avoided emotion    // VOID penalty
```

**Outputs:** alignment_score, alignment_bucket (HIGH/MID/LOW/FIXATED), transition_pattern, mismatch_type

**Transition patterns:** echo_follow, bridge, contradiction, displacement, avoidance, fixation

**Design principle:** The engine does NOT judge. It observes and reports. No interpretation, no recommendation.

See `docs/별이엔진_V4-궤적기반_정렬도-260327.md` for full spec.

## Contamination System

File: `docs/오염벡터_계산_구현_명세_v2-260327.md`

**This is NOT a truth model — it is a staging control model.** Contamination vectors are not objective measurements but rendering control signals.

Three axes: divergence, convergence, heterogeneity (+ depth counter)
Three stages: Stage 1 (biased inclination), Stage 2 (interpretation juxtaposition), Stage 3 (hypercompletion)
Stages are mixed, not exclusive — `stage_weights` determine rendering blend.

See the spec doc for formulas. The engine (`ByeoriEngine`) is NEVER modified by contamination — contamination only consumes engine output.

## Key Architecture Files

| File | Purpose |
|------|---------|
| `js/core/ByeoriEngine.js` | Alignment calculation (DO NOT MODIFY without discussion) |
| `js/core/SceneNavigator.js` | Scene navigation via emotion-space radius (TO BE CREATED) |
| `js/core/ContaminationTracker.js` | Per-axis contamination tracking (TO BE CREATED) |
| `js/services/NetworkService.js` | Supabase CRUD + realtime |
| `js/services/AIService.js` | Claude API via Edge Functions |
| `js/shared/math.js` | VAD coordinates, cosine similarity, emotion anchors |
| `js/index.js` | Main app entry (~354KB, monolithic) |
| `js/app/recordChat.js` | Record conversation flow |
| `js/app/burialAnimation.js` | Memory burial animation |
| `js/app/archiveEntry.js` | Archive entry display |
| `js/admin.js` | Admin panel logic |
| `js/demo/demoFlow.js` | Demo path with pin-map navigation (reference implementation) |
| `js/demo/demoState.js` | Demo state management |

## Critical Design Principles

These are non-negotiable. Every implementation must follow them.

### 1. Pattern changes GEOMETRY, not just radius

When SceneNavigator determines next accessible scenes, `transition_pattern` must shift the CENTER of accessible space, not only expand/contract the radius.

```
WRONG:  center = average(userEmotion, originalEmotion)  // always same center
RIGHT:  center = blend(original, user, patternWeights[pattern])  // center shifts per pattern
```

Each pattern has different center bias:
- echo_follow: toward original (0.7 original : 0.3 user)
- bridge: balanced (0.5 : 0.5)
- contradiction: toward OPPOSITE of user's current emotion
- displacement: same emotion axis, shifted attribution target
- avoidance: toward void/neutral zone
- fixation: locked near current scene

If pattern only changes radius, it degrades to a lookup table and the engine's nuance collapses.

### 2. Contamination is DIRECTIONAL, not scalar

Never reduce contamination to a single delta like `(1 - alignment) * 0.15`. Use per-axis deltas (divergence, convergence, heterogeneity, depth). Low alignment from echo_follow and from contradiction produce fundamentally different contamination types.

### 3. Fixation = pattern persistence, NOT count threshold

Do NOT use `fixationCounts >= 2 → FIXATED`. Fixation detection must be a composite signal: recent emotion similarity > 0.85 + repeated attribution + low exploration ratio. Count is auxiliary.

### 4. Fallback has narrative justification

When accessible scenes = 0, don't silently open one. Frame it: "기억의 빈틈이 다른 장면을 끌어당긴다" or "가장 가까운 잔향이 떠오른다."

### 5. Player sees fog, author sees map

Play UI: local/partial view only (nearby accessible scenes in fog).
Admin UI: full emotion-space map with all scenes visible.
If the player sees the full map, it becomes a strategy game. Must feel like "안개 속 감각."

### 6. Record = first Play

The act of narrating a memory IS the first experience of it. Record uses the same engine logic to guide AI questioning RHYTHM (not interpretation). AI changes question texture based on detected patterns — never names the pattern to the user.

### 7. "Initial telling trajectory," not "original"

TEM's philosophy does not believe in pure originals. Record output stores `telling_trajectory` — the emotional pattern during first narration. Play's shape_similarity compares against this trajectory.

### 8. Override budget: 10-15%

Admin scene overrides (force accessible/locked) should stay under ~15% of total scenes. More turns the engine into decoration.

## Implementation Priority (Current Phase)

1. **SceneNavigator.js** — center shift + radius, B fallback for ≤3 scenes
2. **ContaminationTracker.js** — wire to existing 오염벡터 spec (v2)
3. **Main path integration** — replace `currentScene + 1` with SceneNavigator
4. **Admin panel** — radius simulator, isolated scene warning, contamination dashboard
5. **Record pattern-aware questioning** — AI rhythm changes
6. **Initial telling trajectory storage**

## Two Parallel Implementations (Known Tech Debt)

- **Main path** (`index.html` → `js/index.js`): Linear scene progression, appStore state
- **Demo path** (`test/demo2.html` → `js/demo/demoFlow.js`): Pin-map with transition pattern routing

Goal: Unify into main path using SceneNavigator. Demo path is reference, not target.

## Safety System

`js/safety.js` — Three-tier keyword filtering:
- BLOCK_HIGH: immediate crisis response (self-harm, violence)
- BLOCK_MID: warning + gentle redirection
- MONITOR_ONLY: allowed, tracked (depression, emptiness — core TEM material)

Crisis responses come from "Another Me" inner dialogue, not system warnings.

## Database (Supabase)

Key tables: `memories`, `scenes`, `choices`, `plays`, `notes`, `profiles`
Key contamination columns on `memories`: `cont_depth`, `cont_divergence`, `cont_convergence`, `cont_heterogeneity`, `cont_stage_1/2/3`, Welford internals

## Language

- Discussion/docs: Korean
- Code/comments: English
- UI text: Bilingual (ko/en detection via Hangul regex)
