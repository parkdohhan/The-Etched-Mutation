# Seminar Script — "Simulated Readers: Sample Personality, Don't Imagine It"

> Full spoken script for the 17-slide deck (`PersonaSim_세미나_슬라이드-260717.html`).
> ~13–15 min. First person, read aloud. This is a **methods paper** — the arc is
> problem → failed shortcut → our method → results (incl. honest failures) → the
> self-proof → boundary → next. The negative results are the selling point; do not
> hide them, lead with them.
> `[ ]` = stage direction. **Bold** = land it, slow down.

---

## ACT I — The problem  (slides 1–3, ~2.5 min)

**[SLIDE 1 — Title]**
[Three-second hold on the title.]
This is a methods talk. I built a tool to simulate readers for emotion-driven interactive narrative — so I could test a design without recruiting humans on every iteration. But the honest core of this paper isn't that the tool works. **It's a precise map of what it can and cannot do** — and the failures turned out to be the most useful part.

**[SLIDE 2 — the problem]**
Here's the dilemma anyone building these systems knows. To show your system gives different readers different experiences, you need different readers. But real human subjects mean ethics approval, recruitment, payment, tens of minutes each. That's simply unaffordable inside the loop where you fix something, check it, and fix it again. So developers end up judging the whole system on their own five or six playthroughs — **the most extreme sample bias there is.**

**[SLIDE 3 — mode collapse]**
The obvious shortcut is to just ask a language model to invent readers. But there's a well-documented failure: mode collapse. The generated personas quietly converge to one archetype — usually a mild, thoughtful, middle-class narrator. The dissociative, the cruel, the extreme get under-sampled. And for evaluating emotional narrative that's **fatal** — because those extreme readers are exactly the ones who form the *tails* of your response distribution. The whole point of testing diversity.

---

## ACT II — The method  (slides 4–7, ~3.5 min)

**[SLIDE 4 — the core idea]**
[Slow. This is the thesis.]
So here's the whole idea in one line. **Don't imagine personality — sample it, from real people.** We take Big Five personality scores by stratified sampling from three hundred and seven thousand real human respondents to a validated instrument. The language model is demoted: it only *translates* those real scores into a life story. And crucially, it is forbidden from using the trait labels themselves. That single move addresses both failures at once.

**[SLIDE 5 — pipeline]**
The pipeline is four stages, all reproducible. Start from three hundred thousand real Big Five score sets. Stratified-sample fifteen personas — deterministic, fixed seed. The strong model expands each into a biography, with labels suppressed. Then the cheaper model reads the target work scene by scene, producing an emotion distribution per scene. Two different models is deliberate: open-ended creation on the strong one, high-volume structured reading on the cost-efficient one.

**[SLIDE 6 — two rules]**
Two design rules do the real work. **First, stratified sampling** — fifteen strata chosen for psychological relevance to the themes, and deliberately including readers who will *resist* the system: a cynic, an optimist who can't see the shadow. **Second, trait-label suppression** — the biography never says "this person is neurotic." It shows the trait only through concrete life events, plus one mandatory moment where they act against type. That blocks the stereotype caricature that labels produce.

**[SLIDE 7 — the strata table]**
Here's an excerpt of the fifteen readers, with their actual sampled scores. Notice the extremes: p08, the cynical dismantler — very low agreeableness and conscientiousness. p15, the relentless optimist who cannot see the shadow. And two average controls. **Keep p08 and p15 in mind** — these two extremes decide the most important finding of the talk.

---

## ACT III — Results, honest ones first  (slides 8–13, ~5 min)

**[SLIDE 8 — the honesty frame]**
Before any results, the honest frame — stated up front, and again at the end. This validation is **internal calibration, not external truth.** The question is not "do these simulated readers match real humans." It's narrower: does the instrument produce a non-collapsed spectrum instead of everyone landing in the same place, and do the personality-to-trajectory relations point the way theory predicts? Whether the distribution matches real readers is future work. I'll flag that boundary twice, because it's the paper's integrity.

**[SLIDE 9 — over-resonance]**
[Point at the empty left region.]
Result one — and the headline finding is a *failure*. The simulated readers **over-resonate.** Mean alignment is point eight-one, when we'd targeted the mid-range. There's no low tail at all; only the cynic, p08, dips down. In other words, the tool cannot simulate a reader who *fails to connect.* This isn't a bug I'm hiding — it's a measured limit. Sampling restores personality diversity, but the model's upward bias in emotional response survives it. So the tool is valid for relative comparison — rankings, correlations — and biased for the absolute human spectrum.

**[SLIDE 10 — self-report quantizes]**
Result two is a warning about measurement itself. If you let the model report its *own* alignment score, those scores **quantize** — seventy-one percent pile onto just three values, and the range clips. So the self-report is unusable as a continuous measure. The lesson, practical for anyone building a similar pipeline: **never let the model grade its own resonance.** Compute alignment objectively, from the emotion distribution — a cosine against the narrator's original — not from what the model claims it felt.

**[SLIDE 11 — correlations hold]**
Result three — the relations that *do* hold, which is what makes the instrument worth anything. Openness, agreeableness, and extraversion all predict higher resonance, correlations from point five-five to six-three. So the tool discriminates: different personalities really do produce different trajectories. But the misses too — neuroticism went the *wrong* way, negative point three-one. My hypothesis that neurotic readers would be more volatile simply failed in simulation. **Half my pre-registered hypotheses held, half were rejected** — and reporting both is the whole point of a methods paper.

**[SLIDE 12 — asymmetric limit]**
Result four is the sharpest boundary, and it's asymmetric. The cynic p08 — a reader who *refuses* to feel — separates cleanly as the lowest in the distribution. So the negative extreme is reachable. But the optimist p15 — designed to *try and fail* to grasp the darkness — lands mid-pack, seventh of fifteen. The model won't perform not-understanding. **So the tool can simulate a reader who refuses to feel, but not one who tries and fails to comprehend.** That asymmetry is the most important thing the instrument tells you about its own edge.

**[SLIDE 13 — the self-proof]**
[This is the payoff slide. Land it.]
And here's my favorite slide, because the method proves itself *inside its own data.* We anchored personality to a real distribution — and it stayed diverse. But we left the *names* to free generation, and they collapsed: the surname "Yoon" appears in eight of fifteen personas, three of them outright duplicates. The mismatch category, also left free, collapsed to one type at eighty-two percent. **Same model, same prompt.** The one attribute we sampled from real data stayed diverse; every attribute we left free converged. My entire thesis — that diversity has to be sampled, not imagined — got proven by accident, inside my own results.

---

## ACT IV — Boundary and what's next  (slides 14–17, ~3 min)

**[SLIDE 14 — restated boundary]**
Let me restate the boundary, deliberately, a second time. **Shown:** internal discrimination — different personalities produce different, non-collapsed distributions. **Not shown:** that those distributions match real human readers. The responses pass through the model's emotion model, so this is an exploratory instrument, not a truth claim about human behavior. Saying this twice, plainly, is what keeps the tool honest — and honestly, more useful.

**[SLIDE 15 — qualitative trace]**
[Read the quote slowly. Let it land.]
One trace, so the numbers have a face. p08, sampled low on agreeableness and conscientiousness. The strong model, with no labels allowed, wrote a man who in 2019 *let his mother's deathbed call ring — knowing.* Then a different model, reading the work, produced this at scene eight: *"I can't remember what my mother used to make for me anymore. What business does a man who can't even recall a taste have, longing?"* Two different models — and yet the low tail reads as one psychologically consistent person, not noise. The biography predicted his defense would break at bodily detail. In the plays, it does.

**[SLIDE 16 — contribution]**
So the contribution, condensed. A simulated-reader pipeline that avoids mode collapse by *sampling* personality from real distributions rather than imagining it. A label-suppression protocol against stereotype leakage. And — just as much a contribution — a clear characterization of what the tool measures and what it can't: the over-resonance, the blindness to empathic failure, the self-report quantization. **Not a truth oracle — an exploratory instrument with measured edges.**

**[SLIDE 17 — close]**
Where it goes next. The obvious missing piece is a small human pilot — around fifteen readers — measured against the simulated distribution. That's the first real external-validity evidence, and it's the honest next step. After that, running the same personas through different models to isolate how much of the bias is the emotion model itself. The tool exists, its edges are measured, and now it earns its keep by being checked against real people.
[Beat.]
Thank you.

---

## Delivery notes

- **Total ≈ 13–15 min.** For a 10-min slot (ICIDS LBW), cut slide 5 (pipeline) and slide 16 (fold into close).
- **Slow down at:** slide 4 (thesis), slide 9 (over-resonance — the headline), slide 13 (self-proof).
- **The line the audience remembers:** slide 12 — "can simulate a reader who refuses to feel, but not one who tries and fails to comprehend." Do not rush it.
- **Q&A landmines:**
  - "Isn't this just measuring the LLM, not readers?" → Yes — that's precisely why I frame it as internal calibration and mark external validity as the next study. The tool is for *relative* comparison during design iteration, not human truth.
  - "Why one work only?" → Single work is a stated limitation; the 82% mismatch-category dominance can't be separated from work-specific pull without a cross-theme replication (future work).
  - "Is over-resonance a prompt-tuning issue?" → Possibly reducible, but it reproduces the desirable-trait bias documented across the LLM-persona literature — so I report it as a property to design around, not a bug to tune away.
