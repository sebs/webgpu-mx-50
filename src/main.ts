// Browser entry point for the demo page — the first consumer of the public embedding
// API (ADR-0017). The <mx-mixer> host in index.html owns WebGPU, the engine, and the
// render loop; the <mx-console for="mixer"> connects itself through the context
// protocol. This script defines both elements, then wires everything demo-specific
// around the host: the four-source monitor wall, the External Camera In monitor, the
// audio engine, the control-surface adapters, and the monitor-bridge chrome.

import { defineMixer } from './ui/mixer.js';
import { defineConsole } from './ui/console.js';
import { VideoSource } from './sources/video-source.js';
import { ImageSource } from './sources/image-source.js';
import { CameraSource } from './sources/camera-source.js';
import { listVideoInputs, onDeviceChange } from './sources/device-list.js';
import { createDemoFeeds } from './ui/demo-feeds.js';
import { createExtCameraMonitor } from './ui/ext-camera-monitor.js';
import { createMidiPanel } from './ui/midi-panel.js';
import { createExplainToggle } from './ui/explain.js';
import { ensureTheme } from './ui/theme.js';
import { AudioEngine } from './audio/engine.js';
import { AvSynchroTap } from './audio/av-synchro-tap.js';
import { BindingTable } from './control/bindings.js';
import { SignalCoalescer } from './control/resolver.js';
import { KeyboardAdapter } from './control/keyboard.js';
import { GamepadAdapter } from './control/gamepad.js';
import { MidiAdapter } from './control/midi.js';
import { SerialGpiAdapter } from './control/serial.js';
import { resolveBusSource } from './core/resolve.js';
import { directOutSource } from './core/program.js';
import type { MxMixer } from './ui/mixer.js';
import type { SourceRegistry } from './sources/registry.js';
import type { Engine } from './app.js';
import type { FeedBoundDetail, FeedUnavailableDetail, MxDemoFeeds, TallyState } from './ui/demo-feeds.js';
import type { PanelState, AvSynchroEffect } from './state/state.js';
import type { SourceSlot } from './core/types.js';

function showCapabilityMessage(text: string): void {
  const message = document.getElementById('capability');
  if (message) {
    message.hidden = false;
    message.innerHTML = `<h1>WebGPU required</h1><p>${text}</p>`;
  }
  setStatus('webgpu unavailable');
}

function setStatus(text: string): void {
  const status = document.getElementById('mx-status');
  if (status) status.textContent = text;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Monitor tally for a Source slot: red on Program Out, green when selected on a bus. */
function tallyFor(slot: SourceSlot, s: PanelState): TallyState {
  let onAir = false;
  if (s.programOut === 'A' || s.programOut === 'B') {
    onAir = directOutSource(s, s.programOut) === slot;
  } else {
    const lever = s.transition.lever;
    onAir =
      (resolveBusSource(s.busA, 'mixWipe') === slot && lever < 0.98) ||
      (resolveBusSource(s.busB, 'mixWipe') === slot && lever > 0.02);
  }
  if (onAir) return 'onair';
  return s.busA.source === slot || s.busB.source === slot ? 'ready' : 'off';
}

/** The Program-monitor caption: transition mode + lever, e.g. "WIPE STRAIGHT V1 · 42%". */
function transitionLabel(s: PanelState): string {
  const lever = `${Math.round(s.transition.lever * 100)}%`;
  const type = s.transition.type;
  if (type === 'wipe') {
    return `WIPE ${s.transition.wipe.family.toUpperCase()} V${s.transition.wipe.variant + 1} · ${lever}`;
  }
  if (type === 'lum-key') return `LUM KEY · ${lever}`;
  if (type === 'chroma-key') return `CHROMA KEY · ${lever}`;
  return `${type.toUpperCase()} · ${lever}`;
}

/**
 * Mirror the monitor-wall picker into the headless registries and swap the SourceRegistry
 * entry when a feed becomes image-backed (ADR-0008: the registry IS the swap point — the
 * renderer re-reads it every frame, so the swap is race-free). Camera streams hand their
 * audio track to the engine's per-slot head (element taps cannot carry MediaStream audio).
 */
function wireFeedBindings(
  engine: Engine,
  feeds: MxDemoFeeds,
  registry: SourceRegistry,
  videoSources: readonly VideoSource[],
  device: GPUDevice,
  audio: AudioEngine | null,
): void {
  // Boot-bind the domain registry to reality: every feed starts on its procedural pattern.
  ([1, 2, 3, 4] as SourceSlot[]).forEach((slot) => engine.bindings.bind(slot, 'generated', `pattern:${slot}`));

  // Per-slot binding generation: an image decode that resolves AFTER a newer provider
  // choice is stale and must not install (it would put the still on air under the
  // newer provider's label).
  const bindGen = new Map<SourceSlot, number>();

  feeds.addEventListener('mx-feed-bound', (e) => {
    const detail = (e as CustomEvent<FeedBoundDetail>).detail;
    const slot = (detail.index + 1) as SourceSlot;
    const gen = (bindGen.get(slot) ?? 0) + 1;
    bindGen.set(slot, gen);
    engine.bindings.bind(slot, detail.kind, detail.providerId);
    audio?.attachSlotStream(slot, detail.kind === 'camera' ? (detail.stream ?? null) : null);
    if (detail.kind === 'image' && detail.file) {
      void createImageBitmap(detail.file).then(
        async (bitmap) => {
          if (bindGen.get(slot) !== gen) {
            bitmap.close(); // superseded while decoding: drop the stale still
            return;
          }
          const previous = registry.get(slot);
          const image = new ImageSource(device, bitmap);
          await image.acquire();
          if (bindGen.get(slot) !== gen) {
            image.release(); // superseded during the GPU upload
            return;
          }
          if (previous instanceof ImageSource) previous.release();
          registry.set(slot, image);
        },
        () => undefined, // decode failure: the previous Source and binding stay in place
      );
    } else {
      const previous = registry.get(slot);
      if (previous instanceof ImageSource) {
        previous.release();
        registry.set(slot, videoSources[detail.index]!);
      }
    }
  });

  feeds.addEventListener('mx-feed-unavailable', (e) => {
    const detail = (e as CustomEvent<FeedUnavailableDetail>).detail;
    engine.bindings.markUnavailable(detail.providerId);
  });
}

/**
 * Everything demo-specific, wired around the running host. Called from the host's
 * 'mx-ready' window — synchronously before the first frame, so the real feed sources
 * land in the registry with no matte frame ever presented (ADR-0008/0017).
 */
function wireDemo(mixer: MxMixer): void {
  const engine = mixer.engine!;
  const gpu = mixer.gpu!;
  const registry = mixer.registry!;
  const persistence = mixer.persistence; // present: the demo host sets `persist`

  // Source 1–4: live video feeds (ADR-0008 video path) shown on the source monitor
  // wall — distinct procedural clips by default, each swappable for a local video file
  // via its monitor's picker. acquire() never waits on media readiness (ADR-0008).
  const feeds = createDemoFeeds();
  const videoSources = feeds.feedVideos.map((video) => new VideoSource(gpu.device, video));
  ([1, 2, 3, 4] as SourceSlot[]).forEach((slot, i) => registry.set(slot, videoSources[i]!));
  void Promise.all(videoSources.map((source) => source.acquire()));
  document.getElementById('mx-sources')?.appendChild(feeds);

  // The console connected itself via `for="mixer"` (ADR-0017); the demo only needs the
  // element reference for the transient display datasets below.
  const controls = document.querySelector('mx-console') as HTMLElement | null;

  // Explain mode: header toggle that names each block's manual section and spec on hover.
  const headStat = document.querySelector('.mx-head .stat');
  if (controls && headStat) headStat.appendChild(createExplainToggle(controls));

  // Monitor-bridge chrome: program chip, transition caption, and the source tallies
  // reflect every store change; the timecode advances with the logical clock below.
  const pgmLabel = document.getElementById('mx-pgm-label');
  const pgmCaption = document.getElementById('mx-transition-label');
  const reflectBridge = (s: PanelState): void => {
    if (pgmLabel) pgmLabel.textContent = `PROGRAM OUT · ${s.programOut.toUpperCase()}`;
    if (pgmCaption) pgmCaption.textContent = transitionLabel(s);
    ([1, 2, 3, 4] as SourceSlot[]).forEach((slot, i) => feeds.setTally(i, tallyFor(slot, s)));
    extTally?.(s);
  };
  let extTally: ((s: PanelState) => void) | null = null;
  engine.store.subscribe(reflectBridge);
  reflectBridge(engine.store.getSnapshot());

  // Control-input mapping (ADR-0014): every remappable surface normalises onto logical-control
  // signals, coalesced and resolved into store commands once per tick. Bindings persist (ADR-0015);
  // pointer/touch stays on the console's direct path. Non-keyboard surfaces are capability-detected.
  const bindings = new BindingTable(
    persistence?.loadBindings() ?? undefined,
    persistence ? persistence.saveBindings : () => undefined,
  );
  const coalescer = new SignalCoalescer();
  new KeyboardAdapter(bindings, coalescer).attach(window);
  const gamepad = new GamepadAdapter(bindings, coalescer);
  if ('requestMIDIAccess' in navigator) {
    const midi = new MidiAdapter(bindings, coalescer);
    midi.start().catch(() => undefined); // permission denied → dormant
    // MIDI setup panel (ADR-0018): profile switch, MPE toggle, and learn — page-level
    // chrome below the console, attached imperatively (the adapters are page-owned).
    const consoleEl = document.querySelector('mx-console');
    if (consoleEl) consoleEl.insertAdjacentElement('afterend', createMidiPanel(bindings, midi));
  }
  if ('serial' in navigator) {
    // start() only re-attaches ALREADY-GRANTED ports (no prompt); the port chooser is
    // gesture-gated behind the header's GPI button (requestPort needs a user gesture).
    const gpi = new SerialGpiAdapter(bindings, coalescer);
    void gpi.start();
    const stat = document.querySelector('.mx-head .stat');
    if (stat) {
      const gpiBtn = document.createElement('button');
      gpiBtn.type = 'button';
      gpiBtn.className = 'mx-ghostbtn';
      gpiBtn.textContent = 'GPI…';
      gpiBtn.title = 'Connect a Web Serial GPI device (foot switch fires Auto Take)';
      gpi.onPorts = (count) => {
        gpiBtn.textContent = count > 0 ? `GPI ×${count}` : 'GPI…';
      };
      gpiBtn.addEventListener('click', () => void gpi.requestAndAttach());
      stat.appendChild(gpiBtn);
    }
  }

  // Audio engine (ADR-0010): the Web Audio graph, driven live by the store, tapping the
  // feed videos for real per-source audio and getUserMedia for the mic (demand-driven,
  // core/audio.ts micCaptureWanted). It starts suspended — browsers only let audio run
  // after a user gesture, so resume on the first pointer or key press (the keyboard is a
  // first-class control surface); the element taps attach inside that gesture too.
  let audio: AudioEngine | null = null;
  try {
    audio = new AudioEngine(engine.store, {
      sourceElement: (slot) => feeds.feedVideos[slot - 1] ?? null,
      acquireMic: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    });
  } catch {
    // Reported in the final ready status — the demo continues video-only.
  }
  const tap = audio ? new AvSynchroTap(audio) : null;
  const resumeAudio = (): void => {
    void audio?.resume();
    window.removeEventListener('pointerdown', resumeAudio);
    window.removeEventListener('keydown', resumeAudio);
  };
  window.addEventListener('pointerdown', resumeAudio);
  window.addEventListener('keydown', resumeAudio);

  // A/V Synchro (§8.9): the host renders with whatever the avPulse seam measures — a
  // transient per-frame signal, never dispatched or stored (ADR-0010). The last
  // measurement is kept so the console LED cue below reuses it instead of re-measuring.
  let lastPulse: readonly AvSynchroEffect[] = [];
  if (tap) {
    mixer.avPulse = (snapshot) => {
      lastPulse = tap.activeEffects(snapshot.digitalEffect);
      return lastPulse;
    };
  }

  // Real device bindings for the four feeds (ADR-0008): mirror the monitor-wall picker
  // into the headless registries, swap image-backed slots in the SourceRegistry, and
  // adopt camera-stream audio for the slot.
  wireFeedBindings(engine, feeds, registry, videoSources, gpu.device, audio);

  // External Camera In (ADR-0008, reference §10): the dedicated DSK key input.
  // Permission is gesture-gated — attach() only ever runs from the monitor's button;
  // boot never prompts (CameraSource.acquire is a no-op until attached).
  const extMonitor = createExtCameraMonitor();
  document.getElementById('mx-sources')?.appendChild(extMonitor);
  const extCamera = new CameraSource(gpu.device, extMonitor.video);
  registry.set('ext-camera', extCamera);
  extCamera.onLifecycle = (s) => {
    extMonitor.setPhase(s);
    if (controls) controls.dataset.extCameraLive = s.phase === 'live' ? '1' : '';
    if (s.phase === 'live' && s.deviceId) {
      engine.bindings.bindExtCamera('camera', s.deviceId);
      void listVideoInputs().then((d) => {
        engine.catalog.grant('videoinput', d.map((v) => ({ deviceId: v.id, label: v.label, kind: 'videoinput' as const })));
        extMonitor.setDevices(d);
      });
    }
    if (s.phase === 'lost' && s.deviceId) engine.bindings.markUnavailable(s.deviceId);
    if (s.phase === 'unbound') engine.bindings.clearExtCamera();
  };
  extTally = (s) =>
    extMonitor.setTally(
      s.dsk.keySource !== 'ext-camera' ? 'off' : s.dsk.on && extCamera.lifecycle.phase === 'live' ? 'onair' : 'ready',
    );
  extMonitor.addEventListener('mx-ext-attach', (e) => void extCamera.attach((e as CustomEvent<string | undefined>).detail));
  extMonitor.addEventListener('mx-ext-detach', () => extCamera.detach());
  onDeviceChange(() =>
    void listVideoInputs().then((d) =>
      engine.catalog.refresh(d.map((v) => ({ deviceId: v.id, label: v.label, kind: 'videoinput' as const }))),
    ),
  );

  // Input pump (ADR-0014): poll gamepads and flush coalesced signals to store commands
  // before the host advances the timeline and renders — the one place resolveSignal fires.
  mixer.beforeFrame((tick) => {
    gamepad.poll();
    coalescer.flush(engine.store.getSnapshot(), tick, (command) => engine.store.dispatch(command));
  });

  // Display chrome after each rendered frame: timecode, A/V-Synchro LED cue, mic status.
  const timecode = document.getElementById('mx-timecode');
  let lastTimecode = '';
  let lastAvSynchro = '';
  let lastMicState = '';
  mixer.onFrame((_snapshot, tick) => {
    // Timecode chip on the Program monitor: the logical clock as mm:ss:ff at 60.
    if (timecode) {
      const seconds = Math.floor(tick / 60);
      const text = `${pad2(Math.floor(seconds / 60) % 60)}:${pad2(seconds % 60)}:${pad2(tick % 60)}`;
      if (text !== lastTimecode) {
        timecode.textContent = text;
        lastTimecode = text;
      }
    }
    // Console LED cue for the pulsed set the host just rendered with (avPulse above).
    const active = lastPulse.join(' ');
    if (controls && active !== lastAvSynchro) {
      controls.dataset.avSynchroActive = active;
      lastAvSynchro = active;
    }
    // Mic capture status, display-only (same transient-dataset precedent).
    const mic = audio ? audio.micStatus() : 'idle';
    if (controls && mic !== lastMicState) {
      controls.dataset.micState = mic;
      lastMicState = mic;
    }
  });

  setStatus(audio ? 'ready' : 'ready · audio unavailable');
}

function boot(): void {
  ensureTheme();
  defineMixer();
  defineConsole();

  const mixer = document.getElementById('mixer') as MxMixer | null;
  if (!mixer) throw new Error('#mixer host element not found.');

  mixer.addEventListener('mx-unavailable', (e) => {
    e.preventDefault(); // the demo renders its own page-level capability box
    showCapabilityMessage((e as CustomEvent<string>).detail);
  });

  const wire = (): void => {
    try {
      wireDemo(mixer);
    } catch (error) {
      showCapabilityMessage(String(error));
    }
  };
  if (mixer.context) wire();
  else mixer.addEventListener('mx-ready', wire, { once: true });
}

boot();
