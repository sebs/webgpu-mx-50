# ADR-0005: Clean-modern RGBA video representation; defer analog emulation

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The WJ-MX50 is a *digital* mixer wrapped around an *analog NTSC* signal chain. The reference (section 1) describes its internal video plane as 8-bit component video sampled at **4:1:1, Y = 14.3 MHz**, re-timed through a **per-bus frame synchronizer** so that two ungenlocked consumer sources can be mixed glitch-free. Every downstream stage — freeze, strobe, multi, trail — is defined against that internal frame memory, and the effect block even exposes a **Frame button** (reference 8.10) to trade 1-field reduced resolution against 2-field full-frame resolution, accepting interlace "vibration" on motion as the cost of vertical resolution.

None of that internal representation is externally observable behavior a VJ selects; it is the substrate that produces the observable behavior. web-mx-50 runs on WebGPU with browser sources (`<video>`, camera, canvas) that already arrive as discrete, progressive, full-resolution RGB frames on a fixed presentation clock. We must decide the one data model every pipeline stage reads and writes, and decide how much of the analog NTSC substrate — chroma subsampling, interlace fields, composite noise, frame-synchronizer re-timing — we reproduce.

The choice is load-bearing: it fixes texture formats, colour math, and the meaning (or non-meaning) of the Frame button before any effect shader is written.

## Decision Drivers

- **Owner fidelity mandate: CLEAN MODERN.** Full-resolution RGBA in a linear working space, sRGB output; no NTSC analog artifacts.
- **Correct compositing.** Alpha blending, keys, fades, and wipe edges must composite in a linear-light space or they produce wrong (gamma-darkened) edges and halos.
- **Browser source reality.** Sources are already progressive RGB frames on the compositor clock; there is no field parity, no genlock drift, and no composite carrier to model.
- **Simplicity and performance for v1.** Fewer formats and no field/subsample bookkeeping means simpler shaders and less GPU bandwidth.
- **Future optionality.** A retro "analog look" is a plausible later feature and must not be architecturally foreclosed.
- **Fidelity to the reference where it is *observable*.** We defer substrate, not behavior; freeze-family effects must still function (see ADR-0007 (GPU frame memory for freeze-family effects)).

## Considered Options

### Option A — Faithful NTSC emulation

Model 4:1:1 chroma subsampling, two interlaced fields per frame, composite noise, and per-bus frame-synchronizer re-timing; make the Frame button switch field/frame resolution as on hardware.

- Good: Maximum authenticity; the Frame button and synchronizer become meaningful.
- Bad: Directly contradicts the owner's CLEAN MODERN mandate.
- Bad: Large cost — field deinterlacing, YUV↔RGB conversion, noise models, a synthetic timing/genlock layer — for artifacts most users would perceive as degradation.
- Bad: Browser sources carry none of the required information (no fields, no drift), so most of it would be *synthesized* fiction, not emulation.

### Option B — Clean-modern RGBA, linear working space, sRGB output (chosen)

One canonical representation: `rgba8unorm` textures interpreted as linear-light, all compositing done in linear space, presented to an sRGB swapchain. Analog substrate is not modelled; the Frame button and frame synchronizer become no-ops in v1. A documented seam is reserved for a future optional analog post stage.

- Good: Satisfies the fidelity mandate exactly.
- Good: Correct linear-light compositing for keys, fades, and wipe edges.
- Good: Simplest, fastest path; one format, one colour convention.
- Neutral: `rgba8unorm` (8 bits/channel) is adequate for v1; heavy multi-pass trail/paint accumulation can show banding.
- Bad: Two reference controls (Frame button, synchronizer) carry no effect and must be explained to users.

### Option C — Clean-modern, but `rgba16float` working space throughout

Same as B but every intermediate render target is half-float.

- Good: No banding under long effect chains; headroom for wide-gamut / HDR later.
- Bad: ~2× memory bandwidth and storage for every intermediate target, for benefit invisible on most v1 content.
- Neutral: Can be adopted per-stage later without changing the data-model contract.

## Decision Outcome

Chosen option: **Option B — Clean-modern RGBA with a linear working space and sRGB swapchain output.**

The canonical video representation across the entire signal graph (ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow)) is a **4-channel RGBA texture whose colour values are linear-light**, alpha straight (non-premultiplied) at stage boundaries unless a stage documents otherwise.

Concrete rules:

1. **Working space is linear light.** Source frames sampled from `<video>`/camera/canvas are treated as sRGB-encoded and linearized on ingest — sample intermediate targets through sRGB-view formats (e.g. `rgba8unorm-srgb`) or linearize in-shader — so the shader math in every stage operates on linear values.
2. **Working format is `rgba8unorm`** (viewed as `-srgb` where automatic decode/encode is wanted) for v1 intermediate targets. **`rgba16float` is a reserved working-precision option**, adoptable per-stage where banding appears (long trail/paint accumulation) without altering this data-model contract.
3. **Output is sRGB.** The presentation swapchain is configured as an sRGB format (e.g. `bgra8unorm-srgb`); the final linear composite is encoded to sRGB exactly once, at present time.
4. **Alpha is a first-class channel.** Keys (luminance, chroma), DSK, and fade all produce/consume alpha; compositing is defined in linear space so edges and fades are physically correct.
5. **No analog substrate is modelled.** No 4:1:1 chroma subsampling, no interlaced fields, no composite noise, no synthetic genlock/frame-synchronizer timing. Browser frames are progressive and already synchronized by the compositor, so the hardware's frame synchronizer (reference 1) is **moot and out of scope** — there is nothing to re-time.
6. **The Frame field-vs-frame button (reference 8.10) is DEFERRED and a no-op in v1.** With progressive full-resolution frames there is no field/frame resolution trade to make; the control is captured in `frame-field-mode.feature` and tagged `@deferred`. If surfaced in the UI at all, it is inert and labelled as such.
7. **A documented seam is reserved for a future optional analog post stage.** A retro "analog look" (subsampling, field vibration, noise, bandwidth-limit blur, and a re-activated Frame button) may be added later as an **optional post-processing stage appended after Program Out selection** (reference 19 lists 4:1:1 / interlace as the source material for such a look). It is explicitly *not* in the v1 pipeline and must not be assumed by any v1 stage.

### Consequences

**Good:**
- One canonical texture contract simplifies every shader and the golden-image tests (ADR-0016 (Testing strategy: Gherkin domain specs plus golden-image shader tests)).
- Keys, wipe edges, and fades composite in linear light and look correct — no gamma-darkened halos.
- Lower GPU bandwidth and complexity than Option A/C; fastest route to a working v1.
- The analog look becomes a clean opt-in feature rather than a pervasive tax on every frame.

**Bad:**
- Two reference controls (Frame button; the frame synchronizer) have no effect; this gap must be documented in-app and in features so users understand the omission is deliberate.
- `rgba8unorm` can band under long multi-pass accumulation until `rgba16float` is selectively adopted.

**Neutral:**
- Output is unconditionally sRGB in v1; wide-gamut/HDR is possible later via the reserved `rgba16float` working space plus a different swapchain format, without changing the linear-working-space contract.
- The deferred analog stage is a named seam, not a promise; it may never ship.

## More Information

- Depends on / interprets: ADR-0002 (WebGPU as the rendering and compute backend), ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow).
- Enables freeze-family behavior on this representation: ADR-0007 (GPU frame memory for freeze-family effects).
- Consumed by ingest of sources: ADR-0008 (Uniform input-source abstraction).
- Verified by: ADR-0016 (Testing strategy: Gherkin domain specs plus golden-image shader tests).
- Related features: `frame-field-mode.feature` (@deferred — the no-op Frame button), `digital-effect-still.feature`, `digital-effect-strobe.feature`, `digital-effect-multi.feature`, `digital-effect-trail.feature`, `color-correction.feature`.
- Reference sections: 1 (Core Architecture — frame synchronizers, 4:1:1 sampling, signal flow), 8.10 (Frame Button field/frame mode), 19 (Specifications Snapshot — NTSC, 4:1:1, 8-bit component).
