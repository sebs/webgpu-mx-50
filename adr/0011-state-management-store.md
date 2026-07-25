# ADR-0011: Single unidirectional panel state store

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The WJ-MX50 is, in software terms, one large mutable control surface: two buses of
source assignments, colour correction, digital effects, the Mix/Wipe lever and its
modify functions, DSK, Fade, audio levels, and the housekeeping switches. Two hardware
features make the *totality* of that surface a first-class object rather than a loose bag
of widgets:

- **Event Memory (reference section 13)** stores **8 complete panel states**. Store,
  recall, sequential playback, and clear-all all operate on the whole snapshot, not on
  individual controls. This is only tractable if "the whole panel state" is a single,
  copyable, comparable value.
- **Reset vs. field preset (reference section 18)** defines two power-up behaviours over
  that same whole-panel value: `Reset ON` returns to the **factory preset** every power-up;
  `Reset OFF` (field preset) **restores the state at power-off**, *except* Still, Strobe,
  and Special-function state, which always come up cleared.

At the same time three architecture decisions constrain how that state may be held and
mutated:

- The render loop must stay **independent of any reactive UI layer**
  (ADR-0003 (Vanilla TypeScript with banira and no UI framework),
  ADR-0012 (Render loop and transition timing model)). The renderer reads state; it must
  not be re-entrant with, or driven by, UI event handlers.
- The signal graph executes in a **fixed per-stage order**
  (ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow)); each frame the
  renderer needs one coherent set of parameters for every stage, not values that shift
  underneath it mid-frame.
- Controls arrive from **many input surfaces** — Web Component panel widgets
  (ADR-0013 (Hybrid panel-layout UI on Web Components)), remapped keyboard/MIDI/gamepad
  input (ADR-0014 (Control input mapping layer)), Event Memory recall, and preset import.
  All of them mutate the *same* underlying state and must not race or diverge.

We need a state-management approach that makes "the whole panel" a single serializable
value, funnels every mutation through one disciplined path, and hands the render loop a
stable snapshot per frame.

## Decision Drivers

- **One source of truth.** Event Memory, Reset/field-preset, LED states, and the renderer
  must all agree on what the panel currently is.
- **Full serializability.** Event Memory (8 slots) and preset import/export
  (ADR-0015 (Persistence for Event Memory and settings)) require the state to round-trip
  through JSON with no live objects, GPU handles, or class instances embedded.
- **Render/UI decoupling.** The loop reads; the UI writes; neither calls into the other.
- **Deterministic, testable transitions.** Given a state and a command, the next state is
  a pure function — directly checkable by the domain specs
  (ADR-0016 (Testing strategy: Gherkin domain specs plus golden-image shader tests)).
- **No framework.** The mechanism must be a few hundred lines of plain TypeScript, not an
  imported state library that would smuggle in a reactive runtime.
- **Concurrency safety.** Input from widgets, remapped controllers, and recall must not
  interleave into inconsistent state.

## Considered Options

### Option A — Scattered mutable state on the UI components

Each Web Component owns its own control value; the renderer reads directly from the DOM /
component instances.

- Good: nothing to build; values live where they are edited.
- Bad: there is no "whole panel" object, so Event Memory and preset export have nothing to
  snapshot; Reset/field-preset would have to walk every component; the renderer becomes
  coupled to the UI it must stay independent of; two input surfaces editing the same logical
  control (a widget and a MIDI knob) drift apart. Rejected — it contradicts the core
  requirements.

### Option B — Mutable central object, freely written from anywhere

One big `PanelState` object that any code mutates in place; the renderer reads it each frame.

- Good: trivial; one object to snapshot.
- Bad: no single mutation path, so invariants and cross-control rules (e.g. effect
  exclusions from ADR-0007) live nowhere and drift; mid-frame mutation can change values the
  renderer already partially consumed; "what changed" is unknowable, so LED/UI updates must
  poll everything. Rejected.

### Option C — Off-the-shelf reactive store (Redux, Zustand, a signals library)

Adopt an existing store/state library.

- Good: battle-tested; devtools.
- Bad: pulls a reactive runtime into a project that decided against exactly that
  (ADR-0003); most bind naturally to a component framework we are not using; overkill for a
  fixed, well-bounded state shape. Rejected on the no-framework driver.

### Option D (chosen) — A hand-written single store with typed commands and immutable snapshots

One `PanelStore` holding one `PanelState`. All mutations go through `dispatch(command)`,
where `command` is a value from a typed discriminated union. A pure reducer maps
`(state, command) -> nextState`, producing a **new immutable snapshot** (structural sharing;
the previous snapshot is never mutated). Subscribers are notified after commit. The render
loop pulls the current snapshot once per frame.

- Good: single source of truth and single mutation path; snapshots are plain serializable
  data; reducer purity makes behaviour testable; no framework; cross-control invariants have
  exactly one home.
- Bad: we write and maintain the store ourselves; command types must be kept in sync with
  the state shape.
- Neutral: introduces a command vocabulary that the input-mapping layer (ADR-0014) and UI
  (ADR-0013) both target.

## Decision Outcome

Chosen option: **D — a hand-written single store with typed commands and immutable
snapshots.**

**State shape.** `PanelState` is a plain, JSON-serializable tree: no class instances, no
functions, no GPU/`HTMLVideoElement`/`AudioNode` handles. It mirrors the reference control
groups — `busA` / `busB` (source assignment per ADR-0006 (Two-bus source model and Matte
substitution rules), colour correction, digital-effect flags), `matte`, `transition`
(type, lever position, wipe pattern id + modifiers, transition-frame count), `dsk`, `fade`,
`audio`, and `system` (Reset switch, Special-Mode engaged, etc.). **Device bindings are
referenced by stable id, never by live object**: a bus stores a *source id*, and the
resolution from id to the actual input (ADR-0008 (Uniform input-source abstraction)) happens
outside the store. This is what keeps the whole state serializable for Event Memory and
preset export.

**Commands.** Every mutation is a typed command in a discriminated union, e.g.
`{type:"ASSIGN_SOURCE", bus, sourceId}`, `{type:"SET_LEVER", position}`,
`{type:"TOGGLE_DIGITAL_EFFECT", bus, effect}`, `{type:"RECALL_EVENT", slot}`,
`{type:"LOAD_STATE", state}`. UI widgets, the input-mapping layer, Auto Take, and Event
Memory recall all emit commands; none of them writes state directly. `dispatch` is the only
public write path and applies commands one at a time, so concurrent input surfaces serialize
cleanly instead of racing.

**Reducer and invariants.** A pure reducer computes the next snapshot. Cross-control rules
that the reference dictates live here (or in effect-owned reducers the root reducer calls),
so they cannot drift: for example the Still/Strobe/Multi/Compression exclusions surfaced by
the capture controller (ADR-0007 (GPU frame memory for freeze-family effects)) are reflected
as reducer guards, and Program-Out selection stays consistent with bus state
(ADR-0006). Because the reducer is pure, `(state, command) -> nextState` is directly asserted
in the domain specs (ADR-0016).

**Snapshots and the render loop.** The store keeps the current snapshot as an immutable
value; a command commits a new one via structural sharing. The render loop calls
`store.getSnapshot()` **once at the top of each frame** and reads only that value for the
whole frame (ADR-0012), so no mid-frame mutation can tear the parameter set the renderer is
consuming. The renderer never subscribes to or calls into the UI; the UI never reads renderer
internals. This is the decoupling the stack decision requires.

**Notification.** After each commit the store notifies subscribers with the new (and, where
useful, previous) snapshot. The Web Component UI subscribes to reflect control values and
LED states; persistence (ADR-0015) subscribes to schedule debounced saves. Subscribers are
read-only observers — they react by dispatching further commands, never by mutating state.

**Event Memory (reference 13).** Each of the 8 memories is simply a stored `PanelState`
snapshot. **Store** deep-copies the current snapshot into slot *n*; **Recall** dispatches
`LOAD_STATE` with the stored snapshot (then Auto Take executes it per
auto-take.feature and ADR-0012); **sequential playback** walks non-empty slots in order;
**clear-all** empties every slot. Because a snapshot is already plain JSON, storing and
recalling need no bespoke serialization. Special Modes (reference 14) are handled as
system-level command macros, not as stored snapshots.

**Reset vs. field preset (reference 18).** The store is seeded at start-up from the `system`
Reset switch value:

- **Reset ON — factory preset.** Start-up loads a single canonical `FACTORY_PRESET`
  constant (a `PanelState` literal). Every power-up is identical, guarding against odd states
  after a power failure exactly as the hardware intends.
- **Reset OFF — field preset.** Start-up loads the persisted last-known snapshot
  (ADR-0015). Per the reference, a **sanitizing pass** clears the volatile fields before the
  state goes live: Still, Strobe, and Special-function state are forced off regardless of what
  was saved. This is a pure transform `fieldPreset(saved) -> PanelState`, kept beside the
  reducer and unit-tested.

Both paths converge on the same `LOAD_STATE` entry point, so there is exactly one way state
enters the store on boot.

### Consequences

**Good**

- The whole panel is one serializable value, so Event Memory (8 slots), preset
  import/export, and Reset/field-preset are all thin operations over the same type.
- One mutation path (`dispatch`) means input widgets, remapped controllers, Auto Take, and
  recall cannot race or diverge; invariants have a single owner in the reducer.
- The render loop reads an immutable per-frame snapshot and stays fully decoupled from the
  UI, satisfying the no-framework / independent-loop stack decision.
- Pure reducer + pure preset transforms are directly testable in the Gherkin domain specs
  without a GPU (ADR-0016).
- No external state library; a few hundred lines of plain TypeScript.

**Bad**

- We own and maintain the store, the command union, and their sync with the state shape.
- A discriminated-union command vocabulary is more ceremony than direct mutation for
  trivial changes.

**Neutral**

- The command vocabulary becomes a shared contract that ADR-0013 (UI) and ADR-0014 (input
  mapping) both target; a deliberate coupling point, not accidental.
- Volatile-field sanitizing on field-preset load, and effect-exclusion guards, encode
  reference rules in code that must be kept faithful to sections 8, 13, and 18.

## More Information

- Reference: section 13 (Event Memory — 8 whole-panel snapshots, store/recall/sequential/
  clear), section 18 (System & Housekeeping — Reset ON factory preset vs. Reset OFF field
  preset, and the Still/Strobe/Special exclusions on restore).
- ADR-0003 (Vanilla TypeScript with banira and no UI framework) — why the store is hand-written.
- ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow) — the stages the
  snapshot parameterises.
- ADR-0006 (Two-bus source model and Matte substitution rules) — bus/source fields and
  Program-Out consistency.
- ADR-0007 (GPU frame memory for freeze-family effects) — effect flags mirrored as reducer
  guards / LED state.
- ADR-0008 (Uniform input-source abstraction) — sources referenced by id to keep state
  serializable.
- ADR-0012 (Render loop and transition timing model) — the loop reads one snapshot per frame.
- ADR-0013 (Hybrid panel-layout UI on Web Components) — subscribes for control/LED reflection,
  writes only via commands.
- ADR-0014 (Control input mapping layer) — remapped inputs emit the same commands.
- ADR-0015 (Persistence for Event Memory and settings) — persists snapshots for Event Memory
  and field-preset restore.
- ADR-0016 (Testing strategy) — reducer and preset transforms tested as pure functions.
- Features: event-memory.feature, special-modes.feature, auto-take.feature,
  inputs-and-devices.feature.
