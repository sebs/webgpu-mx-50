# ADR-0013: Hybrid panel-layout UI on Web Components

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The WJ-MX50 is operated through a dense hardware control surface: five source buttons per bus, a Matte generator with SELECT/LEVEL/GRADATION, five audio faders, per-bus Colour Correction with an RGB joystick, a ten-button digital effect block with rotary controls, the Mix/Wipe lever and pattern matrix, the Positioner joystick, the DSK sliders, the Fade lever, and the Event Memory / Special Modes keypad. The reference documents these as physically grouped blocks (sections 3 to 16), and operators reason about the instrument in terms of those blocks and the metaphors within them (a *lever*, a *joystick*, an *LED button*, a *fader*).

The project owner has fixed the UI direction as **HYBRID**: preserve the WJ-MX50 control grouping and metaphors, but implement them as clean, responsive, accessible, remappable web controls — explicitly **not** a photoreal skeuomorphic panel. We also committed to vanilla TypeScript with native Web Components and no UI framework (ADR-0003 (Vanilla TypeScript with banira and no UI framework)).

The question this ADR settles: how is the control surface structured as components, what are the reusable control primitives, and how do those components relate to application state and to the render loop?

## Decision Drivers

- Fidelity of *operation*, not appearance: the grouping and metaphors of sections 3 to 16 must survive, so a WJ-MX50 operator recognises the instrument, but the look is clean-modern.
- Accessibility is a first-class requirement: full keyboard operability, correct ARIA roles/states, visible focus, and no reliance on pointer-only gestures.
- Responsive layout: the surface must reflow from a wide desktop panel down to a narrow viewport without losing any control.
- Strict separation from the render loop: the UI must never be on the render hot path, and the render loop must not depend on any reactive UI layer (ADR-0012 (Render loop and transition timing model)).
- Single source of truth: controls read from and dispatch to one state store (ADR-0011 (Single unidirectional panel state store)); components hold no authoritative state of their own.
- Remappability: physical inputs (keyboard, gamepad, MIDI) drive the same control actions as the on-screen widgets (ADR-0014 (Control input mapping layer)).
- No framework, per ADR-0003 — so the composition mechanism must be the platform's own (Custom Elements, Shadow DOM, slots).

## Considered Options

### Option A — Photoreal skeuomorphic canvas panel

Render the whole panel as an image/`<canvas>` with hit regions mapped to the hardware artwork.

- Good: maximal visual nostalgia; pixel-faithful to the unit.
- Bad: directly contradicts the owner's clean-modern/hybrid decision. Effectively inaccessible (canvas hit-testing has no native semantics, no focus order, no ARIA); poor responsiveness (fixed artwork); high asset cost. **Rejected as out of scope by decision of record.**

### Option B — A UI framework (React/Svelte/Lit) with a component library

Build the panel from framework components and a design system.

- Good: fast component authoring; mature tooling.
- Bad: violates ADR-0003 (no framework). Couples the UI to a reactive runtime we deliberately excluded; risks the render loop being pulled into the framework's scheduling. **Rejected.**

### Option C — Native Web Components: primitive control elements composed into block elements (chosen)

A small set of reusable custom-element **control primitives** (LED button, fader, lever, joystick, knob, readout), composed by **block components** that mirror the hardware sections, all bound to the store.

- Good: honours ADR-0003 (platform-native, no framework); primitives give consistent behaviour, styling, and accessibility in one place; blocks map 1:1 to reference sections, preserving the hardware grouping; Shadow DOM encapsulates styling; elements are trivially reusable and independently testable. Accessibility is built into each primitive once.
- Neutral: we own more low-level plumbing (attribute reflection, event wiring) than a framework would provide.
- Bad: no framework ergonomics (no JSX, manual DOM diffing where needed) — mitigated by keeping components thin and state-driven rather than stateful.

### Option D — Plain semantic HTML forms, no custom elements

Use only native `<input type=range>`, `<button>`, etc.

- Good: accessibility largely free.
- Bad: native inputs cannot express the lever, the two-axis joystick, the pattern matrix, or LED state semantics cleanly; styling native controls consistently across browsers is notoriously painful; no shared behaviour layer. **Rejected**, though its primitives (range, button) are reused *inside* our custom elements where they fit.

## Decision Outcome

Chosen option: **C — native Web Components with a control-primitive layer composed into hardware-block components, bound to the state store.**

### Control primitives

Each is a Custom Element with Shadow DOM, a defined ARIA contract, full keyboard support, and a uniform binding surface (a `value`/`state` in, a semantic change event out — no direct store access from the primitive itself; the block wires it to ADR-0011).

- **`mx-led-button`** — momentary or latching button with an LED-state visual. Models the reference's solid / blinking / off states (e.g. Colour Correction blink vs solid per section 6; Mix/Wipe LEDs per 9.1; source-blink substitution per section 3). Role `button`, `aria-pressed` for latching, `aria-disabled` when the hardware forbids the combination (illegal-combination fallback, section 9.4). A `led` attribute reflects `off | on | blink-*` for styling and for `aria-live` announcement of blink meaning.
- **`mx-fader`** — vertical linear fader for the Audio Mix section (A, B, AUX1, MIC/AUX2, MASTER, section 5) and any single-axis level. Role `slider`, arrow-key stepping, Home/End to ends, `aria-valuetext` in dB where meaningful.
- **`mx-lever`** — the **Mix/Wipe lever** (section 9) and the **Fade lever** (section 11). A slider whose *position expresses proportion* between two named endpoints (A↔B, IN↔OUT). Exposes endpoints and centre detent (NAM parks at centre, section 9.3) via attributes; emits continuous position. Auto Take / Auto Fade drive the same value programmatically (ADR-0012), so the lever is a view over the transition position, not the owner of it.
- **`mx-joystick`** — two-axis positioner used by **Position Control / Scene Grabber** (section 7), **Trail** start corner (8.8), **Special Modes** corner selection (14), and the **RGB joystick** of Colour Correction (section 6, a hue/balance vector rather than an X/Y position). A composite widget with `role=application` internally exposing two `slider` axes so keyboard users can drive each axis; pointer/drag for mouse and touch; re-centre control.
- **`mx-knob`** — rotary control for continuous parameters: Matte LEVEL (4), CHROMA (6), Mosaic SIZE / Paint LEVEL / Strobe & Multi TIME / A-V Synchro LEVEL (8), SLICE / HUE (9.5–9.6), ASPECT (9.4), DSK Low/High level (10, rendered as sliders), Fade/Auto-Fade TRANSITION time (11, 15). Role `slider` (a knob is a rotary slider); arrow/Page stepping; discrete-step mode for quantised controls (Mosaic's 31 increments, transition frames in 2-frame steps).
- **`mx-readout`** — non-interactive indicator: Matte colour LED, Wipe Pattern Indicator number (001–255, section 9.4), Audio Level Indicator (section 5), Auto Fade / transition time displays, Event LED confirmation blinks (section 13). `role=status` / `aria-live=polite` so state changes are announced.

### Block components

Composition elements that mirror the reference's hardware blocks and lay out the primitives. Each is a thin, declarative element that subscribes to the relevant store slice and wires primitive events back to store actions:

- `mx-source-block` (section 3), `mx-matte-block` (4), `mx-audio-block` (5), `mx-colour-correction-block` (6) — the input/matte/audio/colour group.
- `mx-position-block` (7) and `mx-digital-effect-block` (8) — positioner/Scene Grabber and the ten-button effect block with A/B/ON selection.
- `mx-mixwipe-block` (9) — lever, Mix/NAM/Wipe/Lum-Key/Chroma-Key selectors, the 7 Pattern Select buttons + Modify buttons, edge/direction, aspect.
- `mx-dsk-block` (10), `mx-fade-block` (11), `mx-audio-follow-block` (12).
- `mx-memory-block` (13, 14) — Event Memory keypad and Special Modes, sharing the MEMORY / SHIFT keys.
- `mx-transport-block` — Program Out selection (section 2/3) and Auto Take (15).

A top-level `mx-panel` host arranges the blocks in a CSS Grid that mirrors the physical layout on wide screens and reflows to a single scrollable column on narrow ones. Blocks are collapsible/`<details>`-friendly so a small viewport can prioritise the active block.

### Binding and boundaries

- **State**: every primitive is stateless with respect to *application* meaning. Blocks read a slice of the ADR-0011 store and pass values down as attributes/properties; primitive change events are translated into store actions by the block. The store is the single source of truth; the DOM is a projection of it. This keeps the UI unidirectional and lets Event Memory recall (section 13) repaint the whole surface by simply re-emitting state.
- **Render loop**: the UI layer never touches WebGPU and is never awaited by the render loop (ADR-0012). Control changes mutate store state; the render loop samples store state each frame. Continuous controls (lever, knobs during Auto Take) update state at input cadence, decoupled from frame cadence.
- **Input mapping**: on-screen widgets and physical controllers both resolve to the same store actions through ADR-0014 (Control input mapping layer), so the lever, a MIDI fader, and an arrow key are three views of one action. Remapping targets the action, not the element.
- **Not skeuomorphic**: styling is clean-modern (flat surfaces, legible type, theme-aware light/dark, visible focus rings). LED "blink" is a state class with an `aria-live` textual equivalent, not a photoreal lamp. No panel photography, no bevel artwork.
- **Deferred controls** (e.g. the Frame field/frame button, section 8.10, per ADR-0005 (Clean-modern RGBA video representation; defer analog emulation)) are present but rendered `aria-disabled` with an explanatory tooltip, so the block grouping stays complete without implying behaviour we do not emulate.

### Consequences

**Good**

- The hardware grouping and metaphors of sections 3 to 16 are preserved exactly, so operator knowledge transfers, while the look stays clean-modern per the decision of record.
- Accessibility (keyboard, ARIA roles/states, focus, live announcements) is implemented once per primitive and inherited by every block.
- No framework dependency; the UI is platform-native and the render loop stays fully independent (ADR-0003, ADR-0012).
- Primitives and blocks are independently unit- and interaction-testable (ADR-0016 (Testing strategy)), and map cleanly onto the UI-facing Gherkin features (source-selection.feature, audio-mixer.feature, colour-correction.feature, transition-mix-nam.feature, wipe-patterns.feature, downstream-key.feature, fade-control.feature, event-memory.feature, special-modes.feature).
- Single-store binding makes Event Memory / Special Modes recall a whole-panel repaint for free.

**Bad**

- More low-level DOM plumbing than a framework provides (attribute reflection, event wiring, focus management written by hand).
- Faithful ARIA for the two-axis joystick and the pattern matrix is non-trivial and needs dedicated interaction tests.

**Neutral**

- The primitive set is intentionally small; unusual hardware controls (RGB joystick, corner pickers) are configurations of `mx-joystick` rather than new elements, trading a little per-widget specialisation for a smaller, more consistent surface.
- Some deferred hardware buttons appear disabled rather than absent, keeping the layout complete at the cost of showing controls that do nothing in v1.

## More Information

- ADR-0003 (Vanilla TypeScript with banira and no UI framework) — mandates the no-framework, Web Components approach.
- ADR-0011 (Single unidirectional panel state store) — the single source of truth every control binds to.
- ADR-0012 (Render loop and transition timing model) — the render loop this UI is kept independent of; drives levers during Auto Take/Auto Fade.
- ADR-0014 (Control input mapping layer) — routes physical controllers to the same store actions as the widgets.
- ADR-0005 (Clean-modern RGBA video representation; defer analog emulation) — basis for rendering the Frame field/frame control as deferred/disabled.
- ADR-0016 (Testing strategy: Gherkin domain specs plus golden-image shader tests) — how the primitives and blocks are verified.
- Reference: docs/wj-mx50-feature-reference.md, sections 3 to 16 (block structure of the control surface).
