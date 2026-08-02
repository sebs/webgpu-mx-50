# Design prompt — mixer-like control surface for web-mx-50

> **Status: executed.** The design round produced `Console UI mockups.zip` (repo
> root); its language is distilled in [`STYLEGUIDE.md`](STYLEGUIDE.md) and implemented
> by `src/ui/theme.ts`, the `src/ui/primitives/` layer, and `src/ui/console.ts`.
> Kept for reference and for future design iterations.

You are designing and building the control surface for **web-mx-50**, a WebGPU browser
recreation of the Panasonic WJ-MX50 two-bus digital A/V mixer. The domain model, GPU
signal path, store, and a placeholder control strip already exist and are fully tested.
Your job is purely the **operator experience**: replace the placeholder strip of native
buttons and range sliders with a control surface that feels like standing at a broadcast
console — while staying inside the architecture decisions recorded in this repo.

## Read these first (in this order)

1. `adr/0013-ui-architecture-web-components.md` — the decided UI architecture. You are
   implementing its Option C: reusable **control primitives** (LED button, fader, lever,
   joystick, knob, readout) composed into **block components** that mirror the hardware
   sections. Photoreal skeuomorphism was explicitly rejected; so were frameworks.
2. `docs/wj-mx50-feature-reference.md` — the hardware's authoritative feature reference.
   The panel blocks are named there: Source Selection (B-1), Matte (B-2), Audio Mixer
   (B-3), Color Correction (B-4), Positioner/Scene Grabber (B-5), Digital Effect block
   (C), Mix/Wipe block with the lever and pattern system (D), DSK, Fade, Event Memory,
   Special Modes. §9.1 describes the Mix/Wipe lever and its LEDs.
3. `src/ui/control-strip.ts` — the current placeholder. Every store command you need is
   already dispatched somewhere in this file; treat it as the wiring inventory.
4. `src/state/commands.ts` and `src/state/store.ts` — the full command vocabulary and the
   subscribe/snapshot API. `src/ui/demo-feeds.ts` — the two live video feed panels.
   `index.html` — the page shell with the Program Out canvas.

## Hard constraints (non-negotiable)

- Vanilla TypeScript, native Web Components, Shadow DOM where it helps. **No framework,
  no bundler, no npm UI dependencies, no external fonts/images/CDNs** — everything is
  authored CSS and inline SVG. (ADR-0003/0013; the app must keep working offline.)
- Components are **stateless views of the store**: render from `store.getSnapshot()`,
  update via `store.subscribe(...)`, mutate only by dispatching typed commands. No
  authoritative UI state. Never touch the render loop (ADR-0011/0012).
- Accessibility is first-class (ADR-0013): every control keyboard-operable with correct
  ARIA roles/states and visible focus; the lever, joysticks, knobs, and pattern grid all
  need non-pointer operation. Respect `prefers-reduced-motion`.
- The build has an old ES lib floor: avoid `Array.prototype.includes`,
  `String.prototype.padStart` and other post-ES2015 built-ins in `src/` (use `indexOf`,
  manual padding). Syntax is fine; newer built-in methods are not.
- `npm test` (typecheck + units + Gherkin scenarios) must stay green. The
  existing headless tests never touch the DOM, so your changes live in `src/ui/` +
  `index.html` and must not alter domain/state modules.

## Design direction — "broadcast console, clean modern"

Aim for the feeling of the instrument, not a photo of it:

- **Monitor bridge above, console below.** The Program Out canvas is the program
  monitor; the two demo-feed previews become source monitors beside/above it. The
  control surface sits below as one continuous dark console.
- **Panel blocks you can read at a glance.** Lay the console out as the hardware's
  blocks (B-1…B-5, C, D, DSK, FADE, MEMORY), each a bordered panel section with an
  engraved-style section label. An operator who knows the WJ-MX50 should recognise the
  regions; a newcomer should see the signal flow left→right.
- **The Mix/Wipe lever is the hero.** A proper vertical T-bar with a wide grab handle,
  A/B end labels and bus LEDs, smooth drag (pointer capture), arrow-key nudge with
  shift for fine steps, and it glides on its own during Auto Take (it already animates
  from the store snapshot — just render it).
- **LED buttons as the status language.** Buttons carry a real LED dot/bar: off, lit,
  and blinking (the substitute-source rule in source selection blinks; A/V Synchro and
  armed effects have states too). Define the LED semantics once in the primitive.
- **Vertical faders with travel slots** for the five audio channels (A, B, Aux1,
  Mic/Aux2, Master) with level meters beside them; rotary **knobs** for TIME/LEVEL/
  MOSAIC-type continuous controls (drag-vertical + arrow keys); two-axis **joysticks**
  for RGB colour correction and the Positioner; a **pattern grid** for the seven wipe
  families and their variants that reads like the hardware's pattern matrix.
- **Dark console material, LED-glow accents.** Near-black surfaces with subtle
  panel seams and inset shadows; small-caps letter-spaced labels (system font stack);
  one restrained accent system: amber = armed/active transition, red = program/tally,
  green = safe/ready. Commit to dark — this is a stage instrument. No wood grain, no
  fake screws, no bitmap textures.
- **Tactile motion.** 80–140 ms ease-out on LED and press states, immediate (0 ms)
  value tracking on lever/fader/knob drags. Nothing bouncy.

## Deliverables, in order

1. **Design spec first** (a short markdown doc): the design-token set (CSS custom
   properties for surfaces, seams, LED colours, typography, spacing), the primitive
   inventory with per-primitive interaction + ARIA spec, and an ASCII layout map of the
   console blocks at desktop width plus the reflow strategy for narrow viewports.
2. **Primitives** as custom elements in `src/ui/primitives/` — suggested set:
   `mx-led-button`, `mx-tbar`, `mx-fader`, `mx-knob`, `mx-joystick`, `mx-pattern-grid`,
   `mx-readout` (numeric/timecode display). Each one: attribute-reflected, store-agnostic
   (value in / event out), keyboard-complete, focus-visible, and documented in its file
   header.
3. **Block components** in `src/ui/blocks/` composing the primitives, each binding to the
   store exactly the way `control-strip.ts` does today (same commands, same snapshot
   reads — behaviour must not change, only the surface).
4. **Console assembly**: replace `createControlStrip` usage in `main.ts` with the new
   console component; restyle `index.html` and the demo-feeds panel to the monitor-bridge
   + console layout.
5. **Gate + smoke**: `npm test` green, `npm run build` clean, then a browser smoke pass
   (Chrome, WebGPU) checking: lever drag + Auto Take glide, source LEDs incl. the
   blinking substitute rule, a wipe with border/soft edge, DSK on/off, fade to black,
   audio faders moving meters, and full keyboard-only operation of one complete
   transition.

Work in that order — spec, then primitives, then blocks — and keep each step green
before the next. Where the reference and the current strip disagree about a label or
grouping, the reference wins; where behaviour is concerned, the store and its tests win.
