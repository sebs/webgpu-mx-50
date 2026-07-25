# ADR-0008: Uniform input-source abstraction

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The hardware WJ-MX50 has four physical **Source** inputs plus an internal **Matte**
generator, and every input is a re-timed NTSC video signal that the frame
synchronizers digitise into the same internal representation (reference 1, 2).
On the panel the operator does not care whether a source arrives over composite
BNC or S-Video Y/C — that distinction is resolved *below* the point where the
operator interacts with it. The panel only exposes "Source 1–4 and Matte" per
bus (reference 3).

In the browser, the equivalent inputs are wildly heterogeneous objects: a live
camera from `getUserMedia`, a playing `HTMLVideoElement` (file or stream), a
decoded still image, and purely synthetic generators (the Matte, colour bars,
alignment/test patterns). Each has a different lifecycle, a different way of
producing a frame, and a different way of getting that frame onto the GPU.

The signal graph defined in ADR-0004 (Explicit signal-graph pipeline mirroring
the hardware flow) needs one thing from all of them: **a GPU texture for the
current frame, this tick, in the linear working space of ADR-0005 (Clean-modern
RGBA video representation; defer analog emulation).** ADR-0006 (Two-bus source
model and Matte substitution rules) needs to bind "the source assigned to a bus"
without knowing which kind of source it is. We therefore need a single interface
that hides all of that variety behind a uniform contract, and a decision about
how frames cross into WebGPU.

## Decision Drivers

- The bus-assignment layer (ADR-0006) and the render loop (ADR-0012, Render loop
  and transition timing model) must treat all five source slots identically.
- Frame import must be cheap enough to run every source, every frame, at the
  render-loop cadence — the freeze family (ADR-0007) depends on always having a
  live texture to snapshot.
- Camera-vs-file-vs-image-vs-generated differences (async readiness, frame-rate,
  intrinsic size, colour space) must be absorbed by the abstraction, not leaked
  into the graph.
- Per-source **device selection** (which camera, which file, which pattern) is a
  real user-facing concern and belongs to the abstraction, not the hardware
  metaphor.
- The composite-vs-S-Video input-priority rule of the original (reference 2) has
  no browser analogue and must not add ceremony to the model.
- Everything stays vanilla TypeScript + WebGPU per ADR-0003 (Vanilla TypeScript
  with banira and no UI framework).

## Considered Options

### Option A — One `Source` interface with per-kind implementations (chosen)

A single `Source` contract (roughly: `acquire()`, `getFrameTexture(device)`,
`intrinsicSize`, `isReady`, `release()`), implemented by `CameraSource`,
`VideoElementSource`, `ImageSource`, and `GeneratedSource` (Matte, bars, test
patterns). The graph holds five slots of type `Source` and never branches on
kind.

- Good: the graph, buses, and render loop see one type; kinds are swappable at
  runtime (reference 3's "select a source" becomes "assign a `Source` to a slot").
- Good: import strategy lives inside each implementation, where the source-kind
  knowledge already is.
- Bad: a thin layer of indirection over what are physically different objects.

### Option B — Union type / tagged discriminated `SourceKind` switched at use sites

Keep the raw objects and `switch` on a `kind` tag wherever a frame is needed.

- Good: no interface to design; direct access to each object's specifics.
- Bad: every consumer (graph, freeze snapshot, colour correction input, DSK key
  source) re-implements the switch; adding a source kind touches every site.
- Bad: leaks readiness/colour-space handling into the graph — exactly what
  ADR-0004 tries to keep clean.

### Option C — Normalise everything to an offscreen `<canvas>` first

Draw every source into a per-source 2D/`OffscreenCanvas` each frame, then import
one canvas type.

- Good: a single import path; uniform intrinsic handling.
- Bad: an extra full-frame copy per source per frame, on the CPU/2D path, for
  no benefit — camera and video can go straight to the GPU (Option A) without it.
- Bad: throws away `importExternalTexture`'s zero-copy fast path.

## Decision Outcome

Chosen: **Option A — a single `Source` interface with per-kind implementations.**
Each source slot on each bus (ADR-0006) holds one `Source`. The interface's only
obligation to the graph is to yield a GPU texture for the current frame in the
linear working space, plus its intrinsic dimensions and a readiness flag.

**Frame import into WebGPU** is chosen per source kind, hidden behind
`getFrameTexture(device)`:

- **Camera (`getUserMedia`) and video file/stream (`HTMLVideoElement`)** — import
  via **`device.importExternalTexture({ source })`** each frame. This is the
  zero-copy path: it yields a `GPUExternalTexture` valid only for the current
  JavaScript task, which is exactly the render-loop lifetime we need, and it lets
  the driver handle YUV→RGB and colour-space conversion at sample time. Because
  the external texture expires per task, sources are re-imported every tick; no
  caching across ticks. When a source must persist beyond the tick (freeze /
  Still / Strobe / Trail per ADR-0007), the graph copies it into an owned texture
  — that is ADR-0007's responsibility, not the source's.
- **Still image** (`ImageBitmap` / decoded `HTMLImageElement`) — import once via
  **`device.queue.copyExternalImageToTexture()`** into an owned `GPUTexture`, then
  reuse that texture every frame. Images are static, so there is nothing to
  re-import per tick.
- **Generated sources** (Matte, colour bars, test patterns) — never touch the DOM.
  They are produced **directly on the GPU** by a render/compute pass into an owned
  texture. The Matte generator (reference 4, specified in matte-generator.feature)
  is one such `GeneratedSource`; colour bars and alignment patterns are others.
  Their "device selection" is a pattern/colour parameter, not a hardware picker.

**Colour space:** every implementation delivers into the linear working space of
ADR-0005. For external textures the conversion rides on the import; for copied
images and generated passes it is applied in the producing shader. The graph
downstream (ADR-0004) can therefore assume linear RGBA regardless of source kind.

**Per-source device selection** is part of the abstraction. A `CameraSource`
carries a `deviceId` chosen from `navigator.mediaDevices.enumerateDevices()`; a
`VideoElementSource` carries a file handle / URL; a `GeneratedSource` carries its
pattern parameters. Selecting *which* source occupies a slot (the panel's Source
1–4 / Matte choice, reference 3) is distinct from selecting *what device or file*
backs that source — the former is ADR-0006's bus model, the latter is bound here
and surfaced by inputs-and-devices.feature.

**Composite-vs-S-Video priority is moot.** Reference 2 describes the hardware
auto-selecting the S-Video feed when both are patched to one source. The browser
has no such dual physical feed: a source is *one* device or file. We therefore
do **not** model an input-connector priority rule at all — the operator (or the
`Source` implementation) simply picks a device or a file. This is consistent with
the clean-modern fidelity decision (ADR-0005): we emulate the *behaviour the
operator sees*, not the analog plumbing beneath it.

### Consequences

Good:

- The signal graph, buses, freeze snapshotter, and DSK key-source selection all
  program against one type; adding a new source kind (e.g. a screen-capture
  source) means writing one implementation, touching no consumers.
- The zero-copy `importExternalTexture` path keeps camera and video cheap enough
  to run every bus every frame, which the freeze family relies on.
- The Matte fits the model as just another `GeneratedSource`, so ADR-0006's
  substitution rules operate on a uniform slot type.
- Colour-space normalisation is centralised at the source boundary, so nothing
  downstream re-checks it.

Bad:

- `GPUExternalTexture`'s per-task validity means bind groups referencing it can't
  be cached across frames; the graph rebuilds those bindings each tick.
- A uniform interface slightly obscures per-kind capabilities (e.g. a still image
  has no meaningful frame-rate), handled by inert defaults on the interface.

Neutral:

- Readiness is asynchronous and kind-specific (camera permission prompt, video
  metadata load, image decode); the `isReady` flag lets the graph fall back to
  black/Matte for a not-yet-ready slot without special-casing the kind.
- Test patterns and colour bars are first-class sources here even though they have
  no hardware panel button, because they are useful for development and alignment;
  they do not appear in the hardware Source 1–4 / Matte set.

## More Information

- Grounded in reference sections 2 (Inputs & Outputs) and 3 (Source Selection).
- ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow) — the
  consumer that requires a uniform per-tick texture.
- ADR-0005 (Clean-modern RGBA video representation; defer analog emulation) —
  defines the linear working space every source delivers into, and the rationale
  for dropping the composite/S-Video distinction.
- ADR-0006 (Two-bus source model and Matte substitution rules) — assigns a
  `Source` to each bus slot and treats Matte as a source.
- ADR-0007 (GPU frame memory for freeze-family effects) — owns the copy of a
  source frame into a persistent texture; the reason `Source` need not cache.
- ADR-0002 (WebGPU as the rendering and compute backend) — provides
  `importExternalTexture` / `copyExternalImageToTexture`.
- Features: source-selection.feature, matte-generator.feature,
  inputs-and-devices.feature.
