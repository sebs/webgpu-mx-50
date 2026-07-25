# Architecture Decision Records

This directory holds the Architecture Decision Records (ADRs) for **web-mx-50**, a
browser recreation of the Panasonic WJ-MX50 two-bus digital A/V mixer rendered with
WebGPU. Each ADR captures one significant decision — its context, the options weighed,
and the consequences — so the reasoning behind the build survives long after the
choice is made.

## Index

| Number | Title | Status | Summary |
| --- | --- | --- | --- |
| [ADR-0001](0001-record-architecture-decisions.md) | Record architecture decisions | Accepted | Adopt MADR-style ADRs as the record of every significant decision in this feature-driven build. |
| [ADR-0002](0002-webgpu-rendering-backend.md) | WebGPU as the rendering and compute backend | Accepted | Use WebGPU for all real-time video compositing and effect compute, matching the hardware's digital signal chain. |
| [ADR-0003](0003-vanilla-ts-banira-no-framework.md) | Vanilla TypeScript with banira and no UI framework | Accepted | Build in vanilla TypeScript on banira with no React/Svelte, keeping the render loop independent of any reactive UI layer. |
| [ADR-0004](0004-signal-graph-pipeline.md) | Explicit signal-graph pipeline mirroring the hardware flow | Accepted | Model processing as a fixed-order signal graph (Source to Program Out) rather than a bag of independent effects. |
| [ADR-0005](0005-clean-modern-video-representation.md) | Clean-modern RGBA video representation; defer analog emulation | Accepted | Standardise on full-resolution linear RGBA with sRGB output and defer NTSC analog artifact emulation. |
| [ADR-0006](0006-two-bus-source-model.md) | Two-bus source model and Matte substitution rules | Accepted | Organise all processing around two independent buses, each selecting one of four Sources or the internal Matte. |
| [ADR-0007](0007-gpu-frame-memory-freeze-effects.md) | GPU frame memory for freeze-family effects | Accepted | Back Still, Strobe, Multi, and Trail with a shared GPU frame store mirroring the hardware's internal frame memory. |
| [ADR-0008](0008-input-source-abstraction.md) | Uniform input-source abstraction | Accepted | Present every input (`<video>`, camera, canvas, Matte) through one uniform source abstraction the pipeline treats alike. |
| [ADR-0009](0009-wipe-pattern-engine.md) | Compositional wipe-pattern engine | Accepted | Generate the 287 wipe combinations compositionally from base pattern families plus modify functions, not hand-authored patterns. |
| [ADR-0010](0010-audio-engine-webaudio.md) | Audio engine on the Web Audio API | Accepted | Route bus-linked audio, the Audio Mix section, and Fade through a Web Audio API graph paralleling the video path. |
| [ADR-0011](0011-state-management-store.md) | Single unidirectional panel state store | Accepted | Hold the entire control surface in one unidirectional state store that is a first-class, snapshottable object. |
| [ADR-0012](0012-render-loop-and-timing.md) | Render loop and transition timing model | Accepted | Define one render loop and timing model driving effect intervals and automatic transitions in real seconds. |
| [ADR-0013](0013-ui-architecture-web-components.md) | Hybrid panel-layout UI on Web Components | Accepted | Preserve the panel's control grouping and metaphors as clean, accessible native Web Components, not a skeuomorphic panel. |
| [ADR-0014](0014-control-input-mapping.md) | Control input mapping layer | Accepted | Insert a remappable input mapping layer between physical/virtual controls and panel state. |
| [ADR-0015](0015-persistence-event-memory.md) | Persistence for Event Memory and settings | Accepted | Persist the 8 Event Memory snapshots and settings across sessions, mirroring the hardware's power-cycle state. |
| [ADR-0016](0016-testing-strategy.md) | Testing strategy: Gherkin domain specs plus golden-image shader tests | Accepted | Cover deterministic domain logic with Gherkin specs and pixel-producing shaders with golden-image tests. |

## About the format

These ADRs follow the [MADR](https://adr.github.io/madr/) (Markdown Any Decision
Records) convention. Each file records **one decision** and is named
`NNNN-kebab-title.md`. A record opens with a level-1 heading (`# ADR-NNNN: Title`) and
a metadata block (Status, Date, Deciders), then works through these sections:

- **Context and Problem Statement** — the forces at play and what must be decided.
- **Decision Drivers** — the criteria that matter.
- **Considered Options** — the alternatives, with brief pros and cons.
- **Decision Outcome** — the chosen option and a **Consequences** subsection listing
  the Good, Bad, and Neutral results.
- **More Information** — links to related ADRs and the relevant feature-reference section.

## Lifecycle

An ADR moves through a small set of statuses:

- **Proposed** — drafted and under discussion; the decision is not yet binding.
- **Accepted** — agreed and in force; this is the plan of record. Every ADR in this
  directory is currently Accepted.
- **Superseded** — replaced by a later decision. A superseded ADR is kept for the
  historical record (never deleted) and links forward to the ADR that replaces it,
  which in turn links back. If a decision is dropped without a replacement it is marked
  **Rejected** or **Deprecated** instead.

Existing ADRs are immutable in intent: rather than rewriting an accepted decision, a
new ADR is added that supersedes it, so the reasoning trail stays intact.
