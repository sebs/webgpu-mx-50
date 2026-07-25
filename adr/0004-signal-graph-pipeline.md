# ADR-0004: Explicit signal-graph pipeline mirroring the hardware flow

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The WJ-MX50 is not a bag of independent effects; it is a fixed-order signal chain
(reference §1). Video enters as a bus assignment, passes through per-bus
conditioning, then through bus-combining transitions and keys, then a downstream
title keyer, and finally a whole-composite fade before leaving as Program Out
(reference §1, §2 "Program Out Selection"). The order is load-bearing hardware
behaviour: the manual explicitly notes the DSK is "downstream of everything, so
titles stay sharp on top of any effect," and "the Fade is last, so it can fade the
entire composite."

We must decide how web-mx-50 organises its rendering. The naive option is to let
each effect UI toggle mutate a shared frame ad hoc. That would let render order
drift with UI wiring and make it impossible to reason about — e.g. whether a title
gets mosaic-pixelated, or whether a fade darkens the title too. We instead need a
representation that makes the hardware's fixed order the *only* order the renderer
can express, and that maps cleanly onto WebGPU render passes.

The canonical flow this ADR must encode (reference §1):

    Source → bus assignment → Colour Correction → Digital Effect → Mix/Wipe
        → Downstream Key (DSK) → Fade → Program Out

## Decision Drivers

- **Fidelity to the fixed order.** Behavioural correctness of DSK-over-effect and
  fade-over-composite depends entirely on stage ordering (reference §1, §10, §11).
- **Per-bus vs. bus-combining clarity.** Colour Correction and the Digital Effect
  block act on one bus at a time (reference §6, §8: "applied per-bus"); Mix/Wipe,
  the Luminance/Chroma keys, DSK, and Fade operate on combined or downstream
  signals. The model must make this distinction explicit and unmis-wireable.
- **Maps onto WebGPU.** Each conceptual stage should be one (or a few) render
  passes reading input texture(s) and writing an output texture — the natural GPU
  unit — supporting ADR-0002 (WebGPU as the rendering and compute backend).
- **Testability.** A stage with declared inputs/outputs can be golden-image tested
  in isolation (ADR-0016, Testing strategy).
- **Independence from UI.** The graph is driven by state, not by widget callbacks,
  so the render loop stays independent of the reactive UI (ADR-0003, ADR-0011).

## Considered Options

### Option A — Explicit ordered signal graph of typed passes (chosen)

Model the pipeline as a fixed, ordered directed graph of named stages. Each stage
is a node that declares its input texture bindings and its single output texture;
edges are the textures. The topology is fixed to the hardware order; panel state
only sets each stage's parameters and enable flags (a disabled stage passes its
input through). The two per-bus branches (A and B) run the same sub-graph
independently and converge at Mix/Wipe.

- Good: the hardware order is structural, not conventional — it cannot drift.
- Good: one node ≈ one WebGPU pass; direct fit to ADR-0002.
- Good: per-bus vs. combining is expressed by node arity (1-in vs. 2-in).
- Good: each node is independently golden-testable (ADR-0016).
- Bad: more upfront structure than an ad-hoc effect list.
- Neutral: needs a small ping-pong texture allocator for pass outputs.

### Option B — Single mega-shader ("uber-pass")

One fragment shader per bus and one for the composite, branching internally on
enabled effects.

- Good: fewest passes, fewest intermediate textures.
- Bad: frame-memory effects (Still/Strobe/Multi/Trail, reference §8.5–§8.8, and
  ADR-0007) need prior-frame textures and multi-pass capture — they do not fit a
  single forward pass.
- Bad: order becomes shader-internal `if` soup; the fixed hardware order is no
  longer visible or enforceable.
- Bad: nearly untestable in isolation.

### Option C — Ad-hoc effect list mutating a shared frame

UI toggles push effect closures onto a list applied in insertion order.

- Good: trivial to start.
- Bad: order depends on UI wiring; DSK-last and Fade-last are not guaranteed.
- Bad: no clean per-bus vs. combining boundary; hard to test.

## Decision Outcome

Chosen: **Option A — an explicit ordered signal graph of typed passes.**

The renderer owns a fixed graph whose shape is the reference §1 flow. Panel state
(ADR-0011) supplies per-stage parameters each frame; the graph shape never changes
at runtime. Stage taxonomy:

**Per-bus stages** (instantiated once for A-bus and once for B-bus; 1 texture in,
1 out):

1. **Source / bus assignment** — resolves the bus's selected input (Source 1–4 or
   Matte) to a texture via the input-source abstraction (ADR-0008); Matte comes
   from the Matte generator (ADR-0006, reference §3–§4).
2. **Colour Correction** — per-bus colour/luma/chroma adjust (reference §6). Note
   the Mono digital effect overrides colour correction on its bus (reference §8.3);
   this is a parameter interaction resolved when building the stage, not a
   reordering.
3. **Digital Effect** — Nega/Mosaic/Mono/Paint/Still/Strobe/Multi/Trail
   (reference §8). Applied to at most one bus at a time. Frame-memory effects read
   prior-frame textures from GPU frame memory (ADR-0007) and may expand into
   multiple sub-passes; they remain a single node in the graph.

**Bus-combining and downstream stages** (2 textures in until the buses converge,
then 1; each 1 out):

4. **Mix / Wipe** — the A-to-B transition: Mix, NAM, Wipe, and the transition-time
   keys Luminance Key and Chroma Key, driven by the Mix/Wipe lever position or Auto
   Take (reference §9; wipe geometry per ADR-0009). Consumes both bus textures,
   emits one composite. This is where the two per-bus branches merge.
5. **Downstream Key (DSK)** — keys titles/characters over the composite from the
   external camera or a bus (reference §10). Reads the merged composite plus a key
   source; emits the composite with the title on top.
6. **Fade** — final stage; fades the whole composite (or selectively Video/DSK/
   Audio) toward Matte/White/Black/A/B (reference §11). Reads the DSK output;
   emits the faded result.

**Program Out** is a terminal selector, not a processing pass: A and B tap the
respective bus's *pre-effect* assignment output directly, while EFFECT taps the
Fade output (reference §2 "Program Out Selection"). Matte-on-a-direct-bus
substitution is handled at this tap point (reference §3, ADR-0006).

Audio is a parallel chain (ADR-0010) synchronised to, but not part of, this video
graph; the Fade and Program Out selectors coordinate the two.

### Why the fixed order matters

- **DSK is downstream of the Digital Effect block on purpose.** If titles were
  keyed before effects, a Mosaic or Paint pass would pixelate/posterize the
  lettering. Placing DSK after Mix/Wipe guarantees titles stay sharp on top of any
  effect (reference §1, §10).
- **Fade is dead last on purpose.** Because it reads the fully composited,
  keyed signal, one lever move fades the entire program — including the DSK title,
  unless the DSK fade enable is left off, which is exactly how the "picture
  disappears but the title remains" trick works (reference §11). A fade placed
  earlier could not act on the whole composite.
- **Per-bus before combining is what makes two-bus mixing meaningful.** Colour
  Correction and Digital Effect must finish per bus so the Mix/Wipe can blend two
  fully-conditioned pictures — including the "same source, different effect on each
  bus" recipes (reference §16).

### Consequences

Good:
- The hardware's authoritative order is structural and cannot be violated by UI
  changes; behavioural claims trace directly to reference §1.
- Clean one-node-per-pass mapping to WebGPU (ADR-0002); intermediate textures are
  explicit and poolable.
- Per-bus vs. combining is encoded in node arity, matching reference §6/§8 vs.
  §9–§11.
- Each stage is independently golden-image testable (ADR-0016).

Bad:
- Requires an intermediate-texture allocator / ping-pong pool and more render
  passes than an uber-shader; some per-frame VRAM and pass-setup overhead.
- Stages that expand into sub-passes (frame-memory effects, ADR-0007) add
  internal complexity behind the single-node facade.

Neutral:
- A few stages are pass-throughs when disabled; the graph shape is constant
  regardless of which effects are active, trading a little wasted work for
  predictable structure and timing (ADR-0012).
- Special Modes (reference §14) are preset parameter macros that drive existing
  Mix/Wipe and Digital Effect stages; they add no new graph topology.

## More Information

- Reference: §1 Core Architecture (signal flow, fixed order), §2 Program Out
  Selection, §6 Colour Correction, §8 Digital Effect Block, §9 Mix and Wipe Block,
  §10 Downstream Key, §11 Fade Control, §14 Special Modes, §16 Combination Recipes.
- Related ADRs: ADR-0002 (WebGPU as the rendering and compute backend),
  ADR-0005 (Clean-modern RGBA video representation; defer analog emulation),
  ADR-0006 (Two-bus source model and Matte substitution rules),
  ADR-0007 (GPU frame memory for freeze-family effects),
  ADR-0008 (Uniform input-source abstraction),
  ADR-0009 (Compositional wipe-pattern engine),
  ADR-0010 (Audio engine on the Web Audio API),
  ADR-0011 (Single unidirectional panel state store),
  ADR-0012 (Render loop and transition timing model),
  ADR-0016 (Testing strategy: Gherkin domain specs plus golden-image shader tests).
- Related features: source-selection.feature, color-correction.feature,
  digital-effects-filters.feature, transition-mix-nam.feature, wipe-patterns.feature,
  luminance-key.feature, chroma-key.feature, downstream-key.feature,
  fade-control.feature, program-output.feature, combination-recipes.feature.
