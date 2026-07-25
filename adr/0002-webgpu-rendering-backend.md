# ADR-0002: WebGPU as the rendering and compute backend

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

web-mx-50 recreates the Panasonic WJ-MX50, a two-bus digital A/V mixer whose
entire feature set is built on real-time digital video processing. Per reference
section 1 (Core Architecture), the original hardware digitises each bus and runs
8-bit component processing through a fixed signal chain: Source -> bus assignment
-> Colour Correction -> Digital Effect -> Mix/Wipe -> Downstream Key -> Fade ->
Program Out. Reference section 19 confirms the workload: 287 wipe patterns, ten
digital-effect families (Nega, Mosaic, Mono, Paint, Still, Strobe, Multi, Trail,
A/V Synchro, Frame), a 9-colour Matte, and two luminance/chroma keyers.

In the browser we must reproduce this pipeline on live sources (camera, video
element, canvas) at full frame rate. The processing is not just alpha-blended
compositing. Several effects are inherently data-parallel neighbourhood or
history operations that map naturally to compute:

- Mosaic (section 8.2) and Paint/posterize (section 8.4) — per-tile / per-level
  reduction across pixel neighbourhoods.
- Trail (section 8.8), Still (section 8.5) and Strobe (section 8.6) — frame-memory
  accumulation and feedback that read a prior frame and write a new one.
- Luminance Key (section 9.5) and Chroma Key (section 9.6) — per-pixel key-signal
  derivation feeding the Mix/Wipe stage and the DSK (section 10).
- Wipe mask fields (section 9, ADR-0009 (Compositional wipe-pattern engine)) —
  large parameterised signed-distance / pattern fields generated per frame.

We need one backend that can express both the render (compositing, output) and
the compute (mask/key/accumulation) halves of this chain without shuttling
pixels back to the CPU. This ADR chooses that backend.

## Decision Drivers

- Compute-shader support for neighbourhood, feedback and mask-field passes that
  are awkward or slow when forced into fragment-only backends.
- A modern, explicit pipeline (typed bind groups, render + compute in one queue)
  matching the fixed multi-stage signal graph of ADR-0004 (Explicit signal-graph
  pipeline mirroring the hardware flow).
- Zero-copy access to live camera/video frames as GPU textures.
- Linear working space with predictable colour handling, per ADR-0005
  (Clean-modern RGBA video representation; defer analog emulation).
- Single API surface — avoid maintaining two rendering codebases.
- Acceptable browser-support reality for the target audience in 2026.

## Considered Options

### Option A — WebGPU (render + compute)

The modern explicit GPU API. Native compute shaders, storage textures/buffers,
render and compute passes submitted on the same queue, typed bind-group layouts,
and `importExternalTexture()` for camera/video frames.

- Good: first-class compute; the accumulation, mosaic, paint, keying and
  wipe-field passes are expressed directly, no fragment-shader contortions.
- Good: explicit pipeline maps cleanly onto the fixed signal graph (ADR-0004).
- Good: external textures give zero-copy live video ingest (ADR-0008 (Uniform
  input-source abstraction)).
- Good: one API for the whole app; simpler mental model and test surface.
- Bad: narrower browser support than WebGL2; unsupported environments get no
  picture at all without a fallback stance.
- Neutral: newer API, smaller pool of prior art than WebGL.

### Option B — WebGL2 (fragment-only)

The widely supported prior-generation API.

- Good: broadest device/browser reach in 2026.
- Bad: no compute shaders. Every "compute" step must be faked as a
  fragment-shader pass writing to a framebuffer, with ping-pong textures for
  accumulation (Trail/Still). Workable but verbose and error-prone for the
  neighbourhood reductions (Mosaic, Paint) and multi-pass wipe fields.
- Bad: no storage buffers; awkward data layouts for parameterised pattern tables.
- Bad: external-video upload paths are less ergonomic and often copy.
- Neutral: mature tooling, but the effect set fights the model.

### Option C — Canvas2D / CPU compositing

2D canvas draw + `getImageData` pixel loops or `filter`.

- Good: trivial to start; universally supported.
- Bad: no realistic path to real-time full-frame per-pixel effects at frame rate;
  CPU pixel loops and repeated GPU->CPU->GPU round-trips are prohibitively slow.
- Bad: cannot express the compute-heavy effects at all in a maintainable way.

### Option D — WebGPU with a WebGL2 fallback path

Ship both backends behind a common abstraction.

- Good: maximum reach and graceful degradation.
- Bad: doubles the shader and pipeline codebase and the golden-image test matrix
  (ADR-0016 (Testing strategy)); the compute effects would need a whole second,
  lower-fidelity implementation for the very features that define this project.
- Bad: large cost for a v1 whose scope is deliberately narrow.

## Decision Outcome

Chosen: **Option A — WebGPU as the single render and compute backend.** All
rendering and all per-pixel/per-frame computation for web-mx-50 run on WebGPU.
There is **no WebGL2 fallback in v1** (Option D is rejected on cost). Live camera
and video sources are ingested via WebGPU external textures
(`importExternalTexture()` for `VideoFrame`/`HTMLVideoElement`, and the equivalent
copy-based path for camera capture where required), keeping frame ingest
zero-copy where the browser allows.

No-WebGPU stance: the app **feature-detects** WebGPU at startup (`navigator.gpu`
present and an adapter/device successfully requested). If unavailable, it shows a
clear, graceful message naming the requirement and the known-good browsers rather
than attempting a degraded WebGL render. This is a deliberate v1 simplification,
consistent with the clean-modern scope (ADR-0005) — we would rather show nothing
than show a second, lower-fidelity pipeline that contradicts the reference
behaviour.

2026 browser-support reality: WebGPU is shipping by default in current
Chromium-based browsers (Chrome/Edge) on Windows, macOS, ChromeOS and Android,
and in Safari (macOS and iOS) as of the Safari 26 line. Firefox has shipped it on
Windows and is rolling out other platforms. Coverage is strong on desktop and
improving on mobile, but not universal — which is exactly why the feature-detect
gate and graceful message are mandatory rather than optional. We target
up-to-date evergreen browsers on capable hardware; we do not commit to legacy or
compute-incapable environments in v1.

Note on hardware emulation: choosing a modern GPU backend does not reintroduce
analog behaviour. Per ADR-0005 we do not emulate the 4:1:1 sampling, 8-bit
component quantisation, or frame-synchroniser timing described in reference
sections 1 and 19; WebGPU processes full-resolution RGBA in a linear working
space. The hardware's frame synchronisers are moot because browser sources
already arrive as discrete, individually addressable frames.

### Consequences

Good:
- Compute shaders express Mosaic, Paint, Trail/Still/Strobe accumulation, keying,
  and wipe mask fields directly, at frame rate, without CPU round-trips.
- One backend, one shader language (WGSL), one bind-group discipline — smaller
  surface for ADR-0016 golden-image and domain tests.
- Explicit pipeline aligns with the fixed signal-graph stages of ADR-0004 and the
  GPU frame memory of ADR-0007 (GPU frame memory for freeze-family effects).
- Zero-copy external-texture ingest keeps live-source latency low (ADR-0008).

Bad:
- Users on browsers/hardware without WebGPU get no application in v1, only a
  message. This narrows the reachable audience.
- No graceful visual degradation path exists until/unless a fallback is added
  later.

Neutral:
- Ties the project to the evolving WebGPU spec and driver maturity; some effects
  may need per-platform tuning.
- WGSL is the only shading language in the codebase; contributors must learn it.

## More Information

- Reference sections 1 (Core Architecture) and 19 (Specifications Snapshot).
- ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow) — the
  pipeline WebGPU realises.
- ADR-0005 (Clean-modern RGBA video representation; defer analog emulation) —
  the fidelity stance this backend implements.
- ADR-0007 (GPU frame memory for freeze-family effects) — depends on WebGPU
  storage textures.
- ADR-0008 (Uniform input-source abstraction) — external-texture ingest.
- ADR-0009 (Compositional wipe-pattern engine) — compute-generated mask fields.
- ADR-0016 (Testing strategy: Gherkin domain specs plus golden-image shader
  tests) — the single-backend test surface.
- Features grounded here: digital-effects-filters.feature, digital-effect-trail.feature,
  digital-effect-still.feature, digital-effect-strobe.feature, wipe-patterns.feature,
  luminance-key.feature, chroma-key.feature, inputs-and-devices.feature.
