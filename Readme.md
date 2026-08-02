# web-mx-50

A WebGPU browser recreation of the **Panasonic WJ-MX50** — the 1990s two-bus digital A/V mixer —
in pure vanilla TypeScript.

It's a **proof of concept with high behavioural fidelity**: can a dense piece of broadcast
hardware be reproduced faithfully in the browser, block for block, driven by a single state store
and rendered on WebGPU — with its behaviour pinned by executable specs derived from the manual?
The **domain model is complete and verified headlessly**; the GPU renders the core signal path,
with the most complex visuals documented as deferred (see below).

> **Status:** proof of concept · Phases 0–8 complete · **unit suite + 563 Gherkin scenarios
> (4137 steps)** green · no UI framework, no bundler.

## What it reproduces

Modelled after the hardware's control blocks (reference §2–§18), all as pure domain logic behind
one store:

- **Two-bus source model** — Source 1–4 + the internal Matte generator, with the blinking
  substitute-source rules where Matte isn't allowed.
- **Mix/Wipe transition engine** — Mix, NAM (brightness composite), the 7-family **compositional
  wipe engine** (variants, Compression/Slide/Multi/Pairing/Blinds, borders/soft edges, direction),
  and the **Luminance & Chroma keys** as transition modes.
- **Digital effects** — the four filters (Nega/Mosaic/Mono/Paint), the freeze family
  (Still/Strobe/Multi/Trail) with the ADR-0007 exclusion state machine, per-bus **Colour
  Correction**, and the **Positioner + Scene Grabber**.
- **Downstream Key** — a title keyer downstream of every effect (fill, key source, level window,
  edge cycle, reverse).
- **Fade** — the final stage: independent Video/DSK/Audio enables to a MATTE/WHITE/BLACK/A/B target.
- **Automation & timing** — **Auto Take / Auto Fade**, frame-counted (0–510 in 2-frame steps),
  pausable, drift-free, on a deterministic fixed-timestep clock (ADR-0012).
- **Audio** — a 7-input mixer with a real fader law, **Audio Follow** (equal-power crossfade tied
  to the lever), **A/V Synchro** (audio-gated effects), and level metering, on the Web Audio API.
- **Event Memory + Special Modes + persistence** — 8 stored panel snapshots (store / recall /
  sequence), the 8-macro Special Mode bank, and tiered, schema-versioned browser storage.
- **Control mapping** — a remappable layer that normalises keyboard / gamepad / MIDI / GPI and a
  local automation API onto one command vocabulary (the modern stand-in for the hardware GPI/serial).

The fixed signal flow the whole thing mirrors (ADR-0004):

```
Source → bus assignment → Colour Correction → Digital Effect → Mix/Wipe → Downstream Key → Fade → Program Out
```

## Quick start

Requires **Node ≥ 20** and, to view it, a **WebGPU browser** (Chrome/Edge 113+, Safari 18+, or
Firefox with WebGPU on).

```bash
npm install
npm run dev     # banira dev server at http://127.0.0.1:8080 (open in a WebGPU browser)
npm test        # typecheck + unit + Gherkin features + golden scaffolding — the full gate
npm run build   # no-bundler ESM output to dist/
```

Individual gates: `npm run typecheck` · `npm run test:unit` · `npm run test:features`.

**Blend video feeds:** on load, all four Sources are live video feeds with their own monitors
(self-contained procedural clips — swap any of them for your own files with the monitor's
*Load clip…* button; *Pattern* brings the clip back). Bus A starts on Source 1, Bus B on
Source 2, transition MIX — drag the **Mix/Wipe lever** to blend them, or try NAM/WIPE, per-bus
colour correction, and the digital effects on top.

## How it's built

The interesting part of the experiment is the architecture, not the artwork:

- **Vanilla TypeScript + WebGPU + [banira](https://github.com/sebs/banira)** — no UI framework and
  no bundler (ADR-0003). Native Web Components for the UI; bare imports resolve via import maps.
- **One pure state store** (ADR-0011) — the whole panel is a single JSON-serializable value; every
  change is a typed command through one pure reducer. That's what makes Event Memory, persistence,
  and the input-mapping layer thin.
- **An explicit signal graph** (ADR-0004) — the hardware's fixed block order is structural in code
  and cannot drift.
- **A deterministic clock** (ADR-0012) — a fixed-timestep logical clock under an rAF present loop,
  so a 300-frame Auto Fade behaves identically on 60 Hz and 144 Hz and tests can step it headlessly.
- **Headless-first, spec-driven testing** (ADR-0016) — the real Gherkin `.feature` files (written
  from the WJ-MX50 manual) execute against the actual domain code with no GPU or DOM, alongside
  `node:test` units. Behaviour is verified against the manual, not against a screenshot.
- **Decisions are recorded** — 16 [ADRs](adr/) capture the load-bearing choices (WebGPU,
  clean-modern colour, the two-bus model, the wipe engine, timing, persistence, control mapping, …).

## What's deferred

The domain model is complete. What remains is inventoried — with a **buildable-vs-out-of-scope
split and a file/line pointer for each item** — in **[docs/DEFERRED.md](docs/DEFERRED.md)**. In
short: the rendered-**pixel** outcomes and **browser-only** surfaces are *buildable* (deferred only
because this environment has no headless-WebGPU runner or device access — verify by browser smoke);
a small set is genuinely not buildable without breaking fidelity (model-constrained scenarios) or
is out of scope (analog/interlace behaviour, dropped by the clean-modern decision, ADR-0005).

## Repository layout

| Path | What's there |
|---|---|
| [`src/`](src/) | the app — `core/` (pure domain), `state/` (store + reducer), `engine/` (clock + loop + renderer), `gpu/` (WebGPU passes + WGSL), `audio/`, `control/`, `persistence/`, `ui/` |
| [`features/`](features/) | the Gherkin/Cucumber specs — the executable behaviour contract |
| [`test/`](test/) | `unit/` (node:test), `features/` (Cucumber world + steps), `golden/` (image scaffolding) |
| [`adr/`](adr/) | 16 architecture decision records |
| [`docs/`](docs/) | [architecture](docs/architecture.md) · [ROADMAP](docs/ROADMAP.md) (build history) · [DEVELOPMENT](docs/DEVELOPMENT.md) (run & test) · [DEFERRED](docs/DEFERRED.md) · the WJ-MX50 feature reference |
