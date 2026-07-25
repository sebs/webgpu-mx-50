# Feature Index — web-mx-50

Gherkin specifications for the browser recreation of the Panasonic WJ-MX50 two-bus digital A/V mixer.

These `.feature` files are the **living specification** of the project. Per ADR-0016 (Testing strategy: Gherkin domain specs plus golden-image shader tests), the domain behaviour described here is executable intent: each scenario is the authoritative statement of what a block should do, ground-truthed against `docs/wj-mx50-feature-reference.md`. When behaviour and code disagree, the feature file wins until a scenario is deliberately changed.

Features are ordered below by the hardware signal flow:

> Source -> bus assignment -> Colour Correction -> Digital Effect -> Mix/Wipe -> Downstream Key (DSK) -> Fade -> Program Out

## Legend

- **@deferred** — Not built in the clean-modern v1. The control grouping is preserved for faithfulness, but the underlying behaviour is moot in a full-resolution RGBA build with no analog artifacts (see ADR-0005).
- **@integration** — Cross-feature recipe. Composes multiple blocks into a documented "power user" look rather than specifying a single block in isolation.
- **@wip** — Needs design. Scenario captures intent but a decision is still open. *(No feature currently carries this tag.)*

Untagged features are in scope for the clean-modern v1 build.

## Source / Matte / Audio

| Feature file | Description | Tags |
| --- | --- | --- |
| `source-selection.feature` | Assign one of Source 1-4 or the internal Matte to each bus before any effects, keys, or transitions. | — |
| `matte-generator.feature` | Internal 9-colour generator with selectable colour, level, and gradient for backgrounds, borders, key fills, and fade targets. | — |
| `audio-mixer.feature` | Independent per-input faders feeding a master level with a 0 dB indicator, to balance programme sound against the video. | — |

## Colour

| Feature file | Description | Tags |
| --- | --- | --- |
| `color-correction.feature` | Per-bus tri-state colour correction with CHROMA saturation and an RGB tint joystick, applied before the effect and transition stages. | — |

## Digital Effects

| Feature file | Description | Tags |
| --- | --- | --- |
| `digital-effects-filters.feature` | Filter-family effects (Nega, Mosaic, Mono, Paint) restyling a chosen bus without touching the other. | — |
| `digital-effect-still.feature` | Freeze the current frame of a bus instantly to hold a live still. | — |
| `digital-effect-strobe.feature` | Freeze a bus into a stop-motion sequence of held frames for a rhythmic stepped-still strobe. | — |
| `digital-effect-multi.feature` | Tile the picture into a grid of captured images with controllable capture timing (freeze-once or continuous cycle). | — |
| `digital-effect-trail.feature` | Compressed source leaves a decaying motion-echo trail of progressively larger copies. | — |
| `position-and-scene-grabber.feature` | Place a resizable wipe inset (PinP) on screen and freeze / drag the image grabbed inside it. | — |
| `av-synchro.feature` | Incoming audio pulses the selected digital effects in time with the sound, hands-free. | — |
| `frame-field-mode.feature` | Frame button trading vertical resolution against motion "vibration"; kept for panel faithfulness, moot without interlace. | @deferred |

## Mix / Wipe / Keys

| Feature file | Description | Tags |
| --- | --- | --- |
| `transition-mix-nam.feature` | Composite A-bus and B-bus as a proportional cross-dissolve (Mix) or a brightness-based non-additive mix (NAM). | — |
| `wipe-patterns.feature` | Compositional wipe engine building hundreds of numbered patterns from a small set of primitives. | — |
| `wipe-edge-and-direction.feature` | Shape the wipe boundary with a hard border or soft edge and control its direction of travel. | — |
| `luminance-key.feature` | Key the B-bus over the A-bus based on brightness, to drop bright titles or graphics onto a background. | — |
| `chroma-key.feature` | Key the B-bus onto the A-bus based on a chosen colour, for green-screen (or any solid-colour) compositing. | — |

## DSK

| Feature file | Description | Tags |
| --- | --- | --- |
| `downstream-key.feature` | Superimpose titles/characters over the finished composite with adjustable key window, fill, edge, and polarity. | — |

## Fade

| Feature file | Description | Tags |
| --- | --- | --- |
| `fade-control.feature` | Independent Video, DSK, and Audio fades to a chosen target (matte, white, black, or a clean bus) as the final stage before Program Out. | — |

## Audio Follow

| Feature file | Description | Tags |
| --- | --- | --- |
| `audio-follow.feature` | A-bus and B-bus audio levels track the Mix/Wipe lever so a video transition carries its audio hands-free. | — |

## Memory / Modes

| Feature file | Description | Tags |
| --- | --- | --- |
| `event-memory.feature` | Store complete panel setups in 8 numbered memories and recall them on demand. | — |
| `special-modes.feature` | Eight factory-preset effect macros triggered with a single Event button and the Mix/Wipe lever. | — |
| `auto-take.feature` | Mixer performs the selected transition automatically over a set number of frames — a motorless "lever move". | — |

## Program Out / Inputs

| Feature file | Description | Tags |
| --- | --- | --- |
| `program-output.feature` | Choose whether Program Out carries the raw A-bus, the raw B-bus, or the fully effected composite. | — |
| `inputs-and-devices.feature` | Bind each mixer input to a real browser device, file, or generated source, re-pickable at runtime. | — |

## Integration

| Feature file | Description | Tags |
| --- | --- | --- |
| `combination-recipes.feature` | Stack the WJ-MX50 blocks into the manual's documented "power user" recipes to reproduce its signature looks. | @integration |

## Related

- **ADR-0016** (Testing strategy: Gherkin domain specs plus golden-image shader tests) — why these files are the living specification.
- **ADR-0004** (Explicit signal-graph pipeline mirroring the hardware flow) — the signal flow this index is ordered by.
- **ADR-0005** (Clean-modern RGBA video representation; defer analog emulation) — why `frame-field-mode.feature` is deferred.
- `docs/wj-mx50-feature-reference.md` — the authoritative hardware behaviour every scenario is grounded in.
