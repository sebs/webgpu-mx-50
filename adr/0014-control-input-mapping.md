# ADR-0014: Control input mapping layer

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The WJ-MX50 is driven almost entirely by dedicated physical controls: five
source buttons per bus, a Mix/Wipe lever, an RGB joystick for the Positioner and
Chroma Key, rotary controls for Colour Correction and Transition time, and banks
of LED-lit mode buttons (reference sections throughout blocks B–H). It also
exposes three *external* editing interfaces (reference 17): a **GPI** BNC contact
that fires Auto Take on the pulse's falling edge, an **RS422** port for the
AG-A800 edit controller (transitions, wipe pattern calls 01–99, DSK IN/OUT event
tie-in), and an **RS232C** port for a modem/PC.

In the browser we have none of that hardware, but we have richer input surfaces:
pointer and touch, the keyboard, the **Gamepad API** (analog sticks and triggers
that map naturally onto the lever and joystick), and **Web MIDI** (control
surfaces with faders, knobs, and pads — the closest modern analogue to a mixer
panel). The hybrid-UI decision (ADR-0013, Hybrid panel-layout UI on Web
Components) already builds clean, remappable web controls; but if each Web
Component reaches directly into the state store, we scatter input handling,
hard-code key bindings, and make it impossible to drive one logical control (say,
"the Mix/Wipe lever") from a pointer *and* a gamepad axis *and* a MIDI fader at
once.

We need a layer that sits between raw input events and the panel state store
(ADR-0011, Single unidirectional panel state store), turning heterogeneous
physical/logical input into the same **state commands** the UI already dispatches,
and doing so through a **remappable** binding table rather than hard-coded
handlers. We also need a browser-appropriate reinterpretation of the three
editing interfaces of reference 17.

## Decision Drivers

- The store (ADR-0011) accepts a single vocabulary of state commands; every input
  path — pointer, key, gamepad, MIDI, automation — must converge on that
  vocabulary and nothing else.
- The hybrid UI (ADR-0013) is explicitly **remappable and accessible**; bindings
  must be data, reassignable at runtime, not compiled-in event listeners.
- Several controls are **continuous** (lever position 0–1, joystick X/Y, colour
  and transition rotaries) and want analog input; the Gamepad API and MIDI CC
  provide it, so the layer must handle absolute *and* relative continuous input,
  not just discrete triggers.
- The render loop (ADR-0012, Render loop and transition timing model) must stay
  independent of any input or UI layer; input is sampled/queued, never allowed to
  block or reach into the frame pipeline.
- Reference 17's editing interfaces are real, cited features, but GPI/RS422/RS232C
  are electrical protocols with no faithful web equivalent; we must preserve their
  *intent* (external trigger; external automation) without emulating serial wiring.
- Everything stays vanilla TypeScript + WebGPU per ADR-0003 (Vanilla TypeScript
  with banira and no UI framework); no input-library dependency.

## Considered Options

### Option A — Central input-mapping layer emitting state commands (chosen)

One layer owns all input adapters (pointer/touch, keyboard, Gamepad, Web MIDI,
automation). Each adapter normalises its raw events into **control signals**
addressed to a *logical control id* (e.g. `lever.position`, `busA.source`,
`autoTake.trigger`). A **binding table** maps physical inputs to logical controls;
a resolver turns a control signal into the store's state command. Web Components
render state and, for direct manipulation, feed the *same* logical-control path.

- Good: one convergence point; the store sees identical commands no matter the
  origin; adding an input surface is one adapter, no consumer changes.
- Good: bindings are data — remappable at runtime, persistable (ADR-0015),
  satisfying ADR-0013's remappable/accessible goal.
- Good: multiple physical inputs can drive one logical control simultaneously.
- Bad: an extra indirection and a binding schema to design and version.

### Option B — Per-component event handlers dispatching to the store

Each Web Component listens for its own pointer/key events and dispatches commands
directly; gamepad/MIDI bolted on ad hoc where needed.

- Good: least upfront structure; direct and obvious for pointer input.
- Bad: key bindings hard-coded per component; no single remap surface; gamepad and
  MIDI have no natural home and get duplicated or omitted.
- Bad: violates ADR-0013's remappability and spreads input concerns across the UI.

### Option C — Adopt an external input/hotkey/MIDI library

Pull in a third-party binding/hotkey and Web MIDI wrapper.

- Good: less code to write for parsing and chord handling.
- Bad: contradicts ADR-0003's no-framework, minimal-dependency stance; the
  browser APIs (KeyboardEvent, Gamepad, requestMIDIAccess) are already close to
  what we need; a thin in-house adapter is smaller than the integration surface.

## Decision Outcome

Chosen: **Option A — a central input-mapping layer that normalises every input
surface into logical-control signals, resolved through a remappable binding table
into the state commands of ADR-0011.** The layer has three parts:

**1. Input adapters** (one per surface, each converting raw events to control
signals):

- **Pointer/touch** — drives the Web Components of ADR-0013 directly (drag the
  lever, throw the joystick, press a button). This is the accessible default path
  and needs no binding entry; the component addresses its own logical control.
- **Keyboard** — global shortcut adapter. Discrete controls (source select, Auto
  Take, Program A/B/EFFECT, mode toggles) bind to keys/chords; continuous controls
  can bind to nudge keys (step the lever/rotary by a fixed increment). Respects
  focus so shortcuts don't fire while typing into a field.
- **Gamepad API** — polled once per render tick (gamepads are poll-only). Analog
  **axes** map to continuous logical controls: a stick axis to `lever.position`,
  the other stick's X/Y to the RGB joystick (Positioner / Chroma-Key sampling of
  reference 7 and 9.6), triggers/knobs to Colour Correction and Transition-time
  rotaries. Buttons map to discrete controls. Absolute axes set position directly;
  a per-binding option supports relative/velocity mapping for endless input.
- **Web MIDI** (`navigator.requestMIDIAccess`) — the richest surface, the modern
  stand-in for a hardware panel. **Note On/Off** → discrete controls (source
  buttons, mode LEDs, Auto Take, Program Out). **Control Change** → continuous
  controls (faders → Audio Mix and the Mix/Wipe lever, knobs → colour/transition
  rotaries). Supports both absolute (7-bit value → 0–1) and relative CC modes.
  Where a surface has motorised faders / LED feedback, the layer emits MIDI
  **output** back to reflect store state, closing the loop (optional, capability-
  detected).

**2. Binding table** — data, not code. Each binding maps a *physical input
address* (key chord, `gamepad:axis/button`, `midi:channel/CC-or-note`) to a
*logical control id* plus a mode (`set` | `nudge` | `toggle` | `trigger`) and,
for continuous inputs, a range/curve. The table is editable at runtime, ships with
sensible defaults, and is **persisted via ADR-0015 (Persistence for Event Memory
and settings)** so a user's remap survives reloads. Ships-with defaults are the
only opinion baked in code.

**3. Resolver** — turns a logical-control signal into exactly one state command
for the store (ADR-0011). Continuous signals are coalesced to at most one command
per control per tick before the render loop reads state, so a flood of gamepad/MIDI
updates never outruns the frame (ADR-0012). The resolver is the *only* thing that
speaks the store's command vocabulary; adapters never touch the store directly.

### Reinterpreting the editing-system interfaces (reference 17)

We preserve intent, not wiring:

- **GPI (Auto Take trigger).** The hardware GPI is a single make-contact BNC that
  fires **Auto Take** on the falling edge (reference 17). We model it as a first-
  class **logical control `autoTake.trigger`** with mode `trigger`, bindable to a
  key, a MIDI note, a gamepad button — and, **optionally**, to a real external
  contact via **Web Serial (WebSerial)** for users who wire a physical foot-switch
  or GPI box to a USB serial adapter. Web Serial is capability-detected and
  entirely optional; when absent, the key/MIDI/gamepad bindings fully cover the
  use case. This keeps the GPI's meaning ("an external pulse performs the take")
  while dropping the BNC/DIP-switch electrical detail. Grounded in auto-take.feature.
- **RS422 / RS232C editor control.** The hardware serial ports let an edit
  controller (AG-A800) or PC trigger transitions, call wipe patterns 01–99, and
  tie Event Memory to DSK IN/OUT points (reference 17). We do **not** emulate a
  serial protocol. Instead we expose an **optional local automation / scripting
  API**: a small in-process command interface (the same state-command vocabulary
  the resolver emits) that a script can call to run transitions, select wipe
  patterns, and step Event Memory (ADR-0015) — the browser analogue of "an
  external controller drives the mixer." It is local-only (no network/serial
  transport is specified here) and is the seam a future automation surface would
  attach to. This satisfies the *behaviour* of reference 17 (external, programmatic
  control of transitions/patterns/events) without a serial stack.

Frame-locked A/B-roll timing outputs (Black Burst / Advance Sync/Reference,
reference 17) are moot under the clean-modern decision (ADR-0005, Clean-modern
RGBA video representation; defer analog emulation) — browser sources are discrete
frames with no VTR to genlock — and are out of scope for this layer.

### Consequences

Good:

- One place turns any input — pointer, key, gamepad, MIDI, automation — into store
  commands; the store, UI, and render loop stay decoupled from input origin.
- Bindings are remappable data persisted via ADR-0015, delivering ADR-0013's
  remappable/accessible promise and letting a MIDI control surface stand in for the
  hardware panel, faders/joystick and all.
- Continuous analog input (lever, joystick, rotaries) is handled uniformly across
  gamepad and MIDI, absolute or relative, and coalesced so it never outruns the
  frame.
- GPI's intent survives as a mappable trigger (with optional Web Serial), and the
  serial editor ports survive as a local automation API — both without emulating
  electrical protocols.

Bad:

- An extra indirection layer plus a binding schema to design, version, and
  migrate as controls are added.
- Web MIDI, Gamepad, and Web Serial availability varies by browser/permission; the
  layer must capability-detect and degrade gracefully, and MIDI/Serial need a user
  gesture / permission prompt.

Neutral:

- Pointer/touch bypasses the binding table (components address their own logical
  control), so the table governs only the remappable hardware-style surfaces —
  intentional, to keep the accessible default path simple.
- The automation API deliberately specifies no transport (no WebSocket/serial);
  it is a local seam. A networked or serial front-end is a later, separate decision.

## More Information

- Grounded in reference sections 17 (Editing System Interface), 15 (Auto Take),
  and 2 (Inputs & Outputs).
- ADR-0011 (Single unidirectional panel state store) — the sole consumer of the
  state commands this layer emits.
- ADR-0013 (Hybrid panel-layout UI on Web Components) — the remappable/accessible
  controls whose pointer path shares this layer's logical-control model.
- ADR-0012 (Render loop and transition timing model) — samples gamepads per tick
  and reads coalesced state; stays independent of input.
- ADR-0015 (Persistence for Event Memory and settings) — persists the binding
  table and backs the automation API's Event Memory stepping.
- ADR-0005 (Clean-modern RGBA video representation; defer analog emulation) — why
  the A/B-roll genlock timing outputs are out of scope.
- ADR-0003 (Vanilla TypeScript with banira and no UI framework) — why no external
  input/MIDI library is adopted.
- Features: auto-take.feature (GPI-as-trigger and the automation-driven take),
  event-memory.feature (automation stepping through stored events),
  inputs-and-devices.feature (device binding for control surfaces).
