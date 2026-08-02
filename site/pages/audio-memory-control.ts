// Route: /machine/audio-memory-control/
//
// The off-spine peer page. These blocks are not on the video signal path, and a site
// organised purely around that path would drop them — including the entire audio half of
// an "A/V mixer".

import { mountShell, section, body, el, blockCard, href } from '../shell.js';
import '../demos/audio.js';
import '../demos/memory.js';
import '../demos/control.js';

const main = mountShell({ route: 'machine/audio-memory-control/' });

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">The Machine · off the signal path</span>
  <h1 style="margin:14px 0 18px;max-width:24ch">Audio, Memory &amp; Control</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:62ch">
    The video chain is not the whole desk. A seven-input audio mixer runs alongside it, tied to the
    lever when you want it. Eight memory slots snapshot the entire panel. Eight macros animate
    transitions. And a remappable control layer normalises keyboard, gamepad, MIDI and a GPI contact
    onto one vocabulary. None of it sits on the
    <a href="${href('machine/')}">signal path</a>, and all of it is modelled.
  </p>`;
intro.appendChild(introWrap);
main.appendChild(intro);

// ---------------------------------------------------------------- audio

const audio = section({ label: 'The "A" in A/V', title: 'The audio mixer', id: 'audio' });
body(audio).appendChild(
  blockCard({
    title: 'Faders, Audio Follow and A/V Synchro',
    block: 'B-3 · G',
    cite: 'reference §5',
    hardware: `<p>Independent faders for each bus, two aux inputs and a mic, feeding a master with a
      0 dB indicator. Audio Follow ties the two bus levels to the Mix/Wipe lever so sound crossfades
      with the picture — while aux and mic keep their own faders and are deliberately excluded.
      A/V Synchro runs the other way: it lets the incoming audio gate a digital effect, pulsing it in
      time with the music.</p>`,
    modelled: `<p>A real fader law, not a raw multiply: silence at the bottom, unity at half travel,
      +12 dB at the top, exponential between, so equal travel means equal dB. Audio Follow is an
      equal-power crossfade — total power stays flat across the sweep, which is what stops the
      dip in the middle. A/V Synchro compares an envelope against a threshold derived from LEVEL, and
      hold time equals time-above-threshold except for Strobe, which the Effect Interval Timer
      governs instead.</p>`,
    demo: 'mx-demo-audio',
    sources: ['src/core/audio.ts', 'src/core/av-synchro.ts', 'src/audio/engine.ts'],
    spec: { feature: 'audio-follow.feature', scenario: 'Audio crossfades continuously as the lever sweeps' },
  }),
);
const audioNote = el('p', { class: 'mx-prose mx-dim' });
audioNote.innerHTML = `In the browser (ADR-0010) the engine taps the feed videos through Web Audio
  behind zeroed faders, gesture-attached; the microphone is demand-driven and has deliberately no
  fake fallback — if it is not granted, it is silent rather than simulated. The aux inputs keep
  stand-in oscillators because a browser has no auxiliary jack.`;
body(audio).appendChild(audioNote);
main.appendChild(audio);

// ---------------------------------------------------------------- memory

const memory = section({ label: 'Snapshots', title: 'Event Memory', id: 'event-memory' });
body(memory).appendChild(
  blockCard({
    title: 'Eight slots, store, recall, sequence',
    block: 'H-1',
    cite: 'reference §13',
    hardware: `<p>MEMORY latches store-mode; the next EVENT NO. button writes the whole panel into
      that slot, and the LED blinks three times to confirm. Buttons 1–4 address slots 1–4, and holding
      SHIFT reaches 5–8. Selecting an event <em>arms</em> a recall without executing it — AUTO TAKE
      performs it. Press AUTO TAKE repeatedly and playback walks the bank in numerical order, skipping
      empty slots and stopping after the last one.</p>`,
    modelled: `<p>This block is the payoff of one pure store. A slot is the panel minus the memory
      bank and Special Mode — an omission that makes recursion impossible by construction — so
      "store" is a copy and "recall" is an assignment through the normal command path. Persistence is
      then a <code>JSON.stringify</code>, and a captured still rides a second blob tier keyed to its
      slot, committed blob-first so the two tiers cannot disagree.</p>`,
    demo: 'mx-demo-event-memory',
    sources: ['src/core/event-memory.ts', 'src/persistence/still-store.ts', 'src/persistence/preset-file.ts'],
    spec: { feature: 'event-memory.feature', scenario: 'Sequential playback skips empty slots' },
  }),
);
main.appendChild(memory);

// ---------------------------------------------------------------- special modes

const special = section({ label: 'Macros', title: 'Special Modes', id: 'special-modes' });
body(special).appendChild(
  blockCard({
    title: 'The eight-macro bank',
    block: 'H-2',
    cite: 'reference §14',
    hardware: `<p>The MEMORY + SHIFT chord enters Special Mode, where the same eight buttons arm
      canned transition macros instead of memories — Mosaic Mix, Stream, Cork Screw, Flip, Shutter,
      Vibrate, Satellite and friends. Several require the lever parked at B before they will start.
      Shutter becomes a circle wipe when a Square pattern is active; Vibrate shakes the B-bus for a
      fixed 64 frames; Satellite orbits until something else interrupts it.</p>`,
    modelled: `<p>Each macro is a pure function from progress and tick to a frame description:
      background layer, foreground layer, centre, half-extent, angle, mix and mosaic amount. The GPU
      pass consumes exactly that struct, so the macros are fully testable with no renderer — and the
      lever precondition is a predicate, not a comment.</p>`,
    demo: 'mx-demo-special-modes',
    sources: ['src/core/special-mode.ts', 'src/core/special-mode-geometry.ts'],
    spec: { feature: 'special-modes.feature', scenario: 'Shutter becomes a Circle Wipe variant when Square Wipe is active' },
  }),
);
main.appendChild(special);

// ---------------------------------------------------------------- control

const control = section({ label: 'Inputs', title: 'Control mapping & devices', id: 'control' });
body(control).appendChild(
  blockCard({
    title: 'One vocabulary for every input',
    cite: 'reference §17 · ADR-0014',
    hardware: `<p>The hardware takes an editor over RS-422/RS-232C and a GPI contact closure that
      fires Auto Take. There is no browser equivalent of either, so the recreation generalises the
      idea: whatever the input — a key, a gamepad button, a MIDI note, a Web Serial GPI edge — it
      resolves to the same logical control.</p>`,
    modelled: `<p>The binding table is <em>data</em>, remappable at runtime and persisted. An address
      maps to a logical control plus a mode (set, nudge, toggle, trigger); adapters normalise their
      input into a signal; one resolver turns a signal plus the current state into at most one
      command. "At most" matters: a control that would be a no-op in the present state resolves to
      nothing, and that is a tested behaviour rather than a silent dispatch.</p>`,
    demo: 'mx-demo-control-map',
    sources: ['src/control/bindings.ts', 'src/control/resolver.ts'],
    spec: { feature: 'auto-take.feature', scenario: 'Any mapped control source can fire Auto Take' },
  }),
);
body(control).appendChild(
  blockCard({
    title: 'Sources, cameras and permission',
    cite: 'inputs-and-devices',
    hardware: `<p>Four source inputs plus a dedicated external camera input for the title keyer. On
      the desk they are BNC connectors; in a browser they are files, cameras and still images, bound
      per source and rebindable.</p>`,
    modelled: `<p>Device enumeration is permission-gated, and modelling that headlessly is what lets
      nine device scenarios run in CI with no camera attached: before a grant a chooser sees no
      devices and no labels; a grant reveals them; a <code>devicechange</code> replaces the set
      without touching permission; losing a device leaves its source unbound rather than silently
      substituting another.</p>`,
    demo: 'mx-demo-devices',
    sources: ['src/sources/device-catalog.ts', 'src/sources/binding.ts'],
    spec: { feature: 'inputs-and-devices.feature', scenario: 'Camera enumeration requires granted permission' },
  }),
);
main.appendChild(control);
