# ADR-0009: Compositional wipe-pattern engine

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The WJ-MX50's headline feature is its **287 wipe pattern combinations** (reference
section 9.4). Crucially, the hardware does **not** store 287 hand-authored patterns:
it builds them compositionally from **7 base pattern families** (each cycling through
up to 4 variants) stacked with a set of **modify** functions — Compression, Slide,
Multi, Pairing, Blinds — and further shaped by **edge** treatment (Border / Soft),
**direction** (One-Way / Reverse), and, for the Square family, an **Aspect** stretch.
Every valid combination gets a number shown on the Wipe Pattern Indicator, and the
manual's Pattern Table assigns those numbers with a clean regularity: `001` is the
plain wipe and **adding 128** (e.g. `129`) is the *same wipe reversed* (reference 9.4,
9.7).

We must reproduce this matrix in the clean-modern renderer. Hand-authoring 287 shader
variants would be unmaintainable, untestable, and would fight the very structure the
hardware exposes. We need an engine that composes a wipe transition from orthogonal
parameters, mirrors the hardware's numbering as a **test oracle**, and handles the
Pattern Table's blank boxes (invalid combinations) exactly as the unit does — by
dropping the offending modifier or falling back to the Straight Wipe (reference 9.4).

The wipe sits at the **Mix/Wipe** stage of the fixed signal flow
(ADR-0004 (Explicit signal-graph pipeline)), consuming the two post-effect bus frames
and producing one composite, driven by the Mix/Wipe lever position from the render
clock (ADR-0012 (Render loop and transition timing model)). All frames are
full-resolution linear RGBA (ADR-0005 (Clean-modern RGBA video representation)).

## Decision Drivers

- Fidelity to reference 9.4/9.7: the 7 families, their variants, every modify function,
  and the Border/Soft/direction/aspect controls must behave as documented.
- **Compositional, not enumerated:** one small set of primitives must generate the whole
  matrix, so adding a family or modifier is O(1) work, not O(287).
- The hardware **pattern number** (001–255, `+128` = reversed) must be reproducible from
  our parameter set and vice versa, giving a deterministic oracle for tests
  (ADR-0016 (Testing strategy)).
- Illegal combinations must degrade exactly as the unit does (modify LED out, or revert
  to Straight Wipe) — no crashes, no silent wrong output.
- The lever is a **continuous [0,1] progress**, so every pattern must be a smooth
  function of progress, animatable by lever drag or Auto Take (auto-take.feature).
- GPU-friendly: expressible as parameterised WGSL sampling one mask field, not 287
  bespoke shaders (ADR-0002 (WebGPU rendering backend)).
- Golden-image testable per family/variant/modifier.

## Considered Options

### Option A — One shader (or texture) per authored pattern

Author each of the 287 patterns as its own shader branch or precomputed mask.

- Good: each pattern is exactly as intended; no composition logic to get wrong.
- Bad: 287 artefacts to write, review, and golden-test; adding a family multiplies work;
  the hardware's own regular structure is thrown away; the `+128` numbering has no
  mechanical meaning. Directly contradicts the "built compositionally" reference. Rejected.

### Option B — Precompute mask animations offline, sample at runtime

Bake each family+variant into a stack of mask frames (a 3D texture over progress),
select and blend at runtime; apply modifiers as texture-space tricks.

- Good: runtime is cheap texture sampling.
- Bad: huge VRAM/asset footprint; modifiers (Compression scales *content*, not the mask;
  Slide translates *content*) cannot all be expressed as mask lookups; aspect/soft/border
  want analytic control. Poor fit for the modify layer. Rejected.

### Option C (chosen) — Signed-distance mask field per family + orthogonal parameter stack

Represent each base family as an **analytic scalar field** `f(uv, progress, variant)`
evaluated in WGSL, thresholded into an A-vs-B selection mask. Modifiers, edges,
direction, and aspect are **orthogonal transforms** applied to the field's input
coordinates, its content sampling, or its threshold — composed in a fixed order. A pure
numbering module maps parameter sets ↔ hardware pattern numbers.

- Good: one mask-field function per family (7 of them) plus a handful of coordinate/edge
  operators generate the entire matrix; smooth in progress by construction; the `+128`
  reverse and the compression/slide/blinds transforms are natural coordinate operations;
  compact and GPU-native; the numbering module is a self-contained oracle.
- Bad: getting each family's field and each operator's math right requires care;
  composition order must be pinned down and documented.
- Neutral: introduces a small legality table (which modifier combos are valid) that
  mirrors the manual's Pattern Table.

## Decision Outcome

Chosen option: **C — signed-distance mask field per family plus an orthogonal parameter
stack.** The wipe engine is defined by three layers: a **field** per family, a fixed-order
**operator stack**, and a **numbering/legality** module.

### Base fields (the 7 families, reference 9.4)

Each family is a function returning a signed scalar (negative = show incoming/B side,
positive = outgoing/A side, zero = boundary), swept by `progress ∈ [0,1]`:

1. **Straight** — half-plane whose edge translates across the frame; the 4 variants are
   the 4 screen edges (L→R, R→L, T→B, B→T).
2. **Corner** — a growing axis-aligned square anchored at one of the 4 corners (variant).
3. **Diagonal** — a half-plane with a diagonal normal; variants are the 4 diagonal angles.
4. **Triangle** — an expanding triangle rooted on one of the 4 edges (variant).
5. **Split** — two symmetric edges opening from the vertical centre; variants V, H, and
   cross (both), matching the reference's 3 split variants.
6. **Mosaic Wipe** — a Straight/Diagonal boundary quantised into blocks: staircase and
   random-block variants come from snapping the field to a block grid before threshold.
7. **Square** — a centred shape growing outward; the 4 variants swap the *distance metric*:
   square (L∞), circle (L2), oval (scaled L2), diamond (L1). The ASPECT knob multiplies
   the metric's x/y weights (Aspect V stretches vertically, Aspect H horizontally,
   reference 9.4), affecting only this family.

The mask is `smoothstep(-w, +w, f)` where `w` is the edge softness (see Soft/Border).

### Operator stack (fixed composition order)

Modifiers are orthogonal operators applied in this pinned order; each is a no-op when off:

1. **Compression** (reference 9.4) — scales the *content* sampled inside the wipe shape so
   the incoming picture appears whole-but-shrunk rather than cropped. **1×** compresses the
   incoming (B) side only; **2×** compresses **both** A and B so they wipe in/out together.
   Implemented by remapping the texture-sample UV per side, independent of the mask field.
   Couples to Digital Effect state: Compression is excluded while Still is active and is
   temporarily suppressed during Strobe (reference 8.5/8.6, exposed via
   ADR-0007 (GPU frame memory for freeze-family effects)).
2. **Slide** (reference 9.4) — translates content so one image slides over the other into
   frame; **1×** slides the incoming image, **2×** slides both across each other. A
   content-UV translation keyed to progress; distinct from Compression (which scales).
3. **Multi** (reference 9.4) — replicates the *mask field* into up to **6** vertical or
   horizontal repeats (the 6 multi modes) by tiling the field's input coordinate before
   evaluation. Combinable with Pairing.
4. **Pairing** (reference 9.4) — mirrors the field about an axis to produce a
   paired/mirrored wipe; a coordinate reflection composed before Multi's tiling so the two
   stack (reference notes Pairing is combinable with Multi).
5. **Blinds** (reference 9.4) — renders the boundary as venetian-blind strips by quantising
   the field along strips and running progress within each strip. **Legal only with
   Straight, Corner, Diagonal, Triangle, and Split** (reference 9.4); illegal elsewhere.

### Edge, direction, aspect

- **Border** (reference 9.4) — 1st press narrow, 2nd wide, 3rd off. A coloured band drawn in
  the `|f| < border` region; colour is the **complementary** of the selected Matte colour
  (ADR-0006 (Two-bus source model and Matte substitution rules)).
- **Soft** (reference 9.4) — narrow/wide feather; sets the `smoothstep` width `w`. No colour.
  Border and Soft are alternative edge treatments.
- **Direction** (reference 9.4) — **Reverse** negates the field (mirrors travel direction);
  **One-Way** forces the same travel each lever swing instead of alternating; together they
  yield symmetrical wiping. Reverse is exactly the `+128` numbering operation (below).
- **Aspect** — Square-family only, folded into that family's distance metric as above.

### Numbering and legality (the oracle)

A pure module maps `{family, variant, modifiers…, direction} ↔ number`. Per reference 9.4:
`001` is the plain wipe and **`n + 128` is `n` reversed** — so bit 7 of the 0–255 index is
the Reverse flag, and the low 7 bits enumerate the forward (parameter) space. This gives a
deterministic round-trip used as a **golden oracle** in tests (ADR-0016): compose a
parameter set → derive its number → confirm it matches the manual's Pattern Table, and
confirm `render(n)` equals `render(n−128)` mirrored. External addressing honours the
reference's limits: RS-422 reaches 001–255, the AG-A800 only 01–99 with `99` = "whatever is
currently set up" (reference 9.7). Numbers 256–287 exist on the panel but are unaddressable
externally — represented but flagged non-external.

### Illegal-combination fallback (reference 9.4)

A legality table encodes the Pattern Table's blank boxes. When a requested stack is invalid
(e.g. Blinds on Square, or a modify combo with no table entry) the engine applies the
hardware's own rule: **drop the offending modifier** (its modify LED goes out, mirrored in
ADR-0011 (Single unidirectional panel state store)) and, if the base itself is unreachable,
**revert to the Straight Wipe**. The engine never renders an undefined combination.

### Consequences

**Good**

- The full 287-pattern matrix falls out of 7 field functions plus ~8 orthogonal operators;
  adding a family or modifier is local, not a 287-way edit.
- Every pattern is a smooth function of lever progress, so drag and Auto Take share one path.
- The `+128 = reversed` rule becomes a single bit, giving a mechanical test oracle against
  the manual's Pattern Table.
- Compression's content-scale vs. Slide's content-translate vs. the mask field are cleanly
  separated, so their combinations behave predictably.
- Illegal combinations degrade exactly as the hardware documents, in one enforced place.

**Bad**

- Each family's signed field and each operator's coordinate math must be derived and
  golden-tested carefully; subtle errors read as "wrong-feeling" wipes.
- The fixed operator-composition order is load-bearing; changing it silently alters results,
  so it must stay pinned and documented.

**Neutral**

- Requires a small legality table and a numbering module that mirror the manual's Pattern
  Table; these are data, maintained alongside the reference.
- Border colour depends on the Matte selection (ADR-0006), and Compression depends on
  freeze-effect state (ADR-0007) — intentional cross-block reads dictated by the reference.
- Special Modes reuse several wipe primitives (e.g. Shutter as a Split/Circle variant,
  reference 14); this engine is their substrate but the macros live in special-modes.feature.

## More Information

- Reference: section 9.4 (Wipe — families, modify functions, Border/Soft, direction, Aspect),
  section 9.7 (Pattern Table & external control — numbering, RS-422/AG-A800 addressing).
- ADR-0002 (WebGPU as the rendering and compute backend) — WGSL mask-field evaluation.
- ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow) — the Mix/Wipe stage.
- ADR-0005 (Clean-modern RGBA video representation; defer analog emulation) — linear RGBA I/O.
- ADR-0006 (Two-bus source model and Matte substitution rules) — Border complementary colour.
- ADR-0007 (GPU frame memory for freeze-family effects) — Compression/Still/Strobe coupling.
- ADR-0011 (Single unidirectional panel state store) — modify LED / dropped-modifier state.
- ADR-0012 (Render loop and transition timing model) — lever progress and Auto Take timing.
- ADR-0016 (Testing strategy) — golden-image and numbering-oracle tests.
- Features: wipe-patterns.feature, wipe-edge-and-direction.feature, transition-mix-nam.feature,
  auto-take.feature, special-modes.feature, combination-recipes.feature.
