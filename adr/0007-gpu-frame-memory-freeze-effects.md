# ADR-0007: GPU frame memory for freeze-family effects

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The WJ-MX50's freeze-family digital effects — Still, Strobe, Multi, and Trail — all
exist because the hardware digitises each bus into internal frame memory and can then
replay, hold, tile, or shrink captured frames (reference sections 1, 8.5–8.8). On the
real unit these effects share the same silicon frame store; that shared substrate is
exactly why the interaction rules read the way they do (Still excludes Strobe/Multi,
Trail may ride on top of Still, and so on).

We need a GPU-side memory strategy that reproduces those four effects and their mutual
exclusions, under the constraints of the clean-modern fidelity decision
(ADR-0005 (Clean-modern RGBA video representation)) and the explicit per-stage signal
graph (ADR-0004 (Explicit signal-graph pipeline)). The Digital Effect block is per-bus
and sits between Colour Correction and Mix/Wipe, so frame memory is a property of a
bus, not of the whole composite.

Two things simplify the browser case relative to the hardware:

- **The built-in frame synchronizer is moot.** The hardware's per-bus frame
  synchronizers re-time two ungenlocked analog sources so they can be mixed glitch-free
  (reference section 1). In the browser every source (`HTMLVideoElement`, camera
  `MediaStream`, canvas, image, Matte) already arrives as discrete, already-timed RGBA
  frames via ADR-0008 (Uniform input-source abstraction). There is no analog timing to
  recover, so we do **not** build a resampling synchronizer. What survives from that
  concept is the useful part: each bus keeps its own **latest-frame texture**, a stable
  per-bus snapshot that downstream effects sample instead of reaching back to the raw
  source.

- **No field/frame distinction.** ADR-0005 defers the Frame field-versus-frame button
  (reference 8.10). Every capture is a full-resolution progressive RGBA frame; there is
  no 1-field reduced-resolution variant to store.

The open question is how to structure GPU textures so that all four effects are cheap,
correct, and share one coherent memory model.

## Decision Drivers

- Fidelity to reference 8.5–8.8, including the exact effect-exclusion rules.
- Per-bus scope: frame memory belongs to A-bus and B-bus independently.
- Bounded, predictable GPU memory — no unbounded frame history.
- Reuse of one capture mechanism across all four effects rather than four bespoke stores.
- Deterministic capture timing driven by the render/transition clock
  (ADR-0012 (Render loop and transition timing model)), so Strobe/Multi/Trail intervals
  are frame-accurate and testable.
- Golden-image testability of held frames and composites
  (ADR-0016 (Testing strategy)).

## Considered Options

### Option A — Read frames back to CPU, hold in JS, re-upload on demand

Capture by `copyTextureToBuffer` → `mapAsync`, keep frames as CPU-side arrays, upload
when an effect needs them.

- Good: trivially inspectable; frame data lives in ordinary memory.
- Bad: readback stalls the pipeline and fights the async GPU model; re-upload latency
  makes interval-accurate Strobe/Multi impractical; wasteful for effects that never need
  the CPU to see the pixels. Rejected.

### Option B — One monolithic frame store per bus, effects special-cased

A single large texture (or texture array) per bus, with each effect writing bespoke code
that reaches into it however it likes.

- Good: minimal abstraction.
- Bad: no shared discipline; Still/Strobe/Multi/Trail each reinvent capture and timing;
  the exclusion rules become scattered `if` checks with no single owner. Rejected.

### Option C (chosen) — Layered per-bus frame memory: latest-frame texture + ring history + ping-pong accumulators

Give each bus a small, fixed set of GPU textures with clearly separated roles, and build
every freeze effect from those primitives:

1. **Latest-frame texture** (1 per bus): the post–Colour-Correction bus frame for the
   current tick, written every frame. This is the "frame synchronizer" survivor and the
   default source every effect captures from.
2. **Freeze texture** (1 per bus): the single held frame for Still, and the current held
   frame for Strobe. Written by a capture pass, read by the effect pass.
3. **Ring/history buffer** (a texture-array of N layers per bus, N = 16): a small circular
   buffer of recently captured frames. Multi tiles are drawn from it; Trail's staggered
   copies are drawn from it. 16 layers covers the deepest case (Multi 4×4, Trail up to 16).
4. **Ping-pong accumulator pair** (2 textures per bus): two same-size targets swapped each
   accumulation step, for Trail's read-previous / write-next compositing (and available to
   any future feedback effect).

A per-bus **capture controller** owns interval timing (driven by the render clock) and the
effect-exclusion state machine, so the rules live in exactly one place.

- Good: one capture path feeds all four effects; memory is bounded and per-bus; timing is
  centralised and deterministic; maps cleanly onto WebGPU
  (ADR-0002 (WebGPU rendering backend)); exclusion rules have a single owner.
- Bad: several textures per bus (bounded but non-trivial VRAM); the ring/ping-pong split
  is a design nuance implementers must understand.
- Neutral: introduces a small state machine that the panel store
  (ADR-0011 (Single unidirectional panel state store)) mirrors as effect flags.

## Decision Outcome

Chosen option: **C — layered per-bus frame memory**. Each bus owns a latest-frame texture,
a freeze texture, a 16-layer ring history buffer, and a ping-pong accumulator pair. The
four freeze effects are implemented as follows.

**Still (reference 8.5).** On engage, copy the latest-frame texture into the freeze texture
once; the effect pass then samples the freeze texture instead of the live frame, so output
holds indefinitely. No interval timer. Because the frozen content is a plain texture, Trail
may run on top of it (see exclusions).

**Strobe (reference 8.6).** The capture controller runs an interval timer set by the TIME
control (~0.03 s to 2.1 s). On each tick it copies the latest-frame texture into the freeze
texture; between ticks the effect pass samples the (now stale) freeze texture, producing the
stop-motion hold. The clock, not wall-time, drives the interval so behaviour is deterministic
and testable.

**Multi (reference 8.7).** Press cycles single → 4 (2×2) → 9 (3×3) → 16 (4×4) → single. The
effect pass renders a grid, each cell scaled from one ring-buffer layer. A TIME-driven timer
(~0.07 s to 2.1 s) advances a write cursor that captures the latest frame into the next tile's
ring layer, so tiles fill in one at a time. **ONCE**: the cursor walks the grid once, then the
controller stops capturing and the grid freezes. **REPEAT**: the cursor wraps and keeps
overwriting tiles cyclically. Tile count sets how many ring layers participate (4, 9, or 16).

**Trail (reference 8.8).** A compressed (shrunken) copy of the live image leaves a trail of up
to 16 progressively placed copies. Implemented with the ping-pong pair: each accumulation step
reads the previous accumulator, draws it (optionally with slight decay/positional stagger), then
composites a freshly captured shrunken frame at the current position, writing to the other
accumulator; the pair swaps. The start corner (upper-left / upper-right) comes from the
Positioner joystick (reference 8.8); moving it mid-trail changes the write position, yielding the
documented "staggered" series. The interval is TIME-driven (~0.07 s to 2.1 s). Depth is capped at
16 copies; older copies age out as the accumulator is overdrawn. The ring buffer supplies the
recent captured frames when a hard 16-copy history (rather than a decaying accumulation) is wanted.

**Effect-interaction rules (single-owner state machine).** The per-bus capture controller enforces
the reference exclusions:

- **Still is mutually exclusive with Strobe, Multi, and Compression.** Engaging any of those while
  Still is active switches Still off automatically (reference 8.5, 8.6). Compression is a Mix/Wipe
  modify function (ADR-0009 (Compositional wipe-pattern engine)); the controller exposes Still state
  so the wipe engine honours the same exclusion, and Compression/Strobe interplay follows 8.6
  (Compression temporarily disabled during Strobe).
- **Trail may run during Still.** Trail's accumulator simply captures from the frozen source instead
  of the live one; the panel reflects this with the Still LED blinking in Trail mode (reference 8.5).
- **A/V Synchro cannot combine with Trail** (reference 8.8); the controller rejects that pair. A/V
  Synchro otherwise pulses Still/Strobe by gating the capture timer, handled in
  av-synchro.feature.
- **Digital effects are per-bus and one-at-a-time-per-bus** (reference section 8); the controller is
  instantiated once per bus and never shared.

The chosen memory footprint per bus: 1 latest-frame + 1 freeze + a 16-layer ring array + 2 ping-pong
targets — bounded and identical for both buses.

### Consequences

**Good**

- One capture mechanism and one timing owner serve all four freeze effects, keeping
  digital-effect-still/strobe/multi/trail behaviour consistent and DRY.
- GPU memory per bus is fixed and predictable; no unbounded frame history.
- Clock-driven intervals make Strobe/Multi/Trail frame-accurate and golden-image testable.
- The exclusion rules live in a single state machine, so they cannot drift between effects.
- The "frame synchronizer" concept is honoured in spirit (stable per-bus snapshot) without
  building analog resampling machinery that the browser does not need.

**Bad**

- Several textures per bus is more VRAM than a naive "grab the source when needed" approach;
  acceptable given the fixed, small count.
- Trail's ping-pong-versus-ring choice (decaying accumulation vs. hard 16-frame history) is a
  subtlety implementers must get right to match the hardware feel.

**Neutral**

- The capture controller's effect flags are mirrored into the panel state store
  (ADR-0011), which drives LED states such as the blinking Still LED during Trail.
- Compression coupling means the Mix/Wipe engine (ADR-0009) must read Still/Strobe state; a
  small cross-block dependency, but an intentional one dictated by the reference.

## More Information

- Reference: sections 1 (Core Architecture — frame synchronizers, frame memory), 8.5 (Still),
  8.6 (Strobe), 8.7 (Multi), 8.8 (Trail).
- ADR-0002 (WebGPU as the rendering and compute backend) — texture and ping-pong primitives.
- ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow) — where the Digital
  Effect block sits.
- ADR-0005 (Clean-modern RGBA video representation; defer analog emulation) — full-res RGBA
  capture; Frame field/frame mode deferred.
- ADR-0006 (Two-bus source model and Matte substitution rules) — per-bus scoping.
- ADR-0008 (Uniform input-source abstraction) — the pre-timed frames that feed capture.
- ADR-0009 (Compositional wipe-pattern engine) — Compression exclusion coupling.
- ADR-0011 (Single unidirectional panel state store) — effect flags / LED mirroring.
- ADR-0012 (Render loop and transition timing model) — the clock driving capture intervals.
- ADR-0016 (Testing strategy) — golden-image tests for held frames and composites.
- Features: digital-effect-still.feature, digital-effect-strobe.feature,
  digital-effect-multi.feature, digital-effect-trail.feature, av-synchro.feature,
  frame-field-mode.feature (deferred).
