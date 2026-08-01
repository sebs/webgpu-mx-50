// Browser entry point. Feature-detects WebGPU (ADR-0002), initialises the device and
// sRGB swapchain, builds the four Source slots (all live video feeds with their own
// monitors) + Matte, wires the headless store to the two-bus renderer and the operator
// console, and runs the render loop. The monitor bridge (source monitors + Program
// monitor chrome) is display-only and store-driven.

import { detectWebGPU, WEBGPU_REQUIREMENT_MESSAGE } from './gpu/capabilities.js';
import { initGpu } from './gpu/device.js';
import type { GpuContext } from './gpu/device.js';
import { MatteSource } from './sources/matte-source.js';
import { VideoSource } from './sources/video-source.js';
import { ImageSource } from './sources/image-source.js';
import { CameraSource } from './sources/camera-source.js';
import { SourceRegistry } from './sources/registry.js';
import { listVideoInputs, onDeviceChange } from './sources/device-list.js';
import { Renderer } from './engine/renderer.js';
import { RenderLoop } from './engine/loop.js';
import { createEngine } from './app.js';
import { createConsole } from './ui/console.js';
import { createDemoFeeds } from './ui/demo-feeds.js';
import { createExtCameraMonitor } from './ui/ext-camera-monitor.js';
import { ensureTheme } from './ui/theme.js';
import { AudioEngine } from './audio/engine.js';
import { AvSynchroTap } from './audio/av-synchro-tap.js';
import { createPersistence } from './persistence/persistence.js';
import { IndexedDbBlobBackend, LocalStorageBackend } from './persistence/backend.js';
import { attachPersistence } from './persistence/subscriber.js';
import { createStillStore } from './persistence/still-store.js';
import { createPresetFileIo } from './persistence/file-io.js';
import { BindingTable } from './control/bindings.js';
import { SignalCoalescer } from './control/resolver.js';
import { KeyboardAdapter } from './control/keyboard.js';
import { GamepadAdapter } from './control/gamepad.js';
import { MidiAdapter } from './control/midi.js';
import { SerialGpiAdapter } from './control/serial.js';
import { resolveBusSource } from './core/resolve.js';
import { directOutSource } from './core/program.js';
import type { FeedBoundDetail, FeedUnavailableDetail, MxDemoFeeds, TallyState } from './ui/demo-feeds.js';
import type { Engine } from './app.js';
import type { PanelState } from './state/state.js';
import type { Size, SourceSlot } from './core/types.js';

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

async function boot(): Promise<void> {
  ensureTheme();
  const capability = detectWebGPU();
  if (!capability.ok) {
    showCapabilityMessage(WEBGPU_REQUIREMENT_MESSAGE);
    return;
  }

  const canvas = document.getElementById('program') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('#program canvas element not found.');

  let gpu: GpuContext;
  try {
    gpu = await initGpu(canvas);
  } catch (error) {
    showCapabilityMessage(`${WEBGPU_REQUIREMENT_MESSAGE} (${String(error)})`);
    return;
  }

  // Persistence (ADR-0015): boot the store from storage (Reset policy + saved bank/field
  // preset), then mirror future changes back. The module owns all localStorage access;
  // captured stills live in the IndexedDB blob tier. attachPersistence waits until the
  // renderer exists — it is the GpuStillPort the still-store reads back through.
  const persistence = createPersistence(new LocalStorageBackend(window.localStorage));
  const blobs = new IndexedDbBlobBackend();
  const engine = createEngine(persistence.restoreOnBoot());
  const size: Size = { width: canvas.width, height: canvas.height };

  // Source 1–4: live video feeds (ADR-0008 video path) shown on the source monitor
  // wall — distinct procedural clips by default, each swappable for a local video file
  // via its monitor's picker. Matte is the internal generator. Blend with the lever.
  const feeds = createDemoFeeds();
  const videoSources = feeds.feedVideos.map((video) => new VideoSource(gpu.device, video));
  const matte = new MatteSource(gpu.device, size);

  const registry = new SourceRegistry();
  ([1, 2, 3, 4] as SourceSlot[]).forEach((slot, i) => registry.set(slot, videoSources[i]!));
  registry.set('matte', matte);
  await registry.acquireAll();

  const renderer = new Renderer({ gpu, registry, generated: [], matte, size });

  // Two-tier still persistence (ADR-0015): blob-first commits, recall reloads, boot sweep.
  const stills = createStillStore(blobs, persistence, renderer);
  attachPersistence(engine.store, persistence, stills);
  const bootSnap = engine.store.getSnapshot();
  void stills.sweepOrphans(bootSnap.memory.slots, [bootSnap.positioner.stillId]);
  if (bootSnap.positioner.sceneGrabber && bootSnap.positioner.stillId != null) {
    void stills.recallStill(bootSnap.positioner.stillId);
  }

  // The operator console (ADR-0013, styled per docs/STYLEGUIDE.md), bound to the single
  // store. The tick provider lets AUTO TAKE / AUTO FADE stamp their press (ADR-0012).
  document.getElementById('mx-sources')?.appendChild(feeds);
  const presetIo = createPresetFileIo({ persistence, store: engine.store, now: () => new Date() });
  const controls = createConsole(engine.store, () => engine.clock.tick, presetIo);
  document.getElementById('mx-console-mount')?.appendChild(controls);

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
  const bindings = new BindingTable(persistence.loadBindings() ?? undefined, persistence.saveBindings);
  const coalescer = new SignalCoalescer();
  new KeyboardAdapter(bindings, coalescer).attach(window);
  const gamepad = new GamepadAdapter(bindings, coalescer);
  if ('requestMIDIAccess' in navigator) {
    new MidiAdapter(bindings, coalescer).start().catch(() => undefined); // permission denied → dormant
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
    // Reported in the final ready status — boot continues video-only.
  }
  const tap = audio ? new AvSynchroTap(audio) : null;
  const resumeAudio = (): void => {
    void audio?.resume();
    window.removeEventListener('pointerdown', resumeAudio);
    window.removeEventListener('keydown', resumeAudio);
  };
  window.addEventListener('pointerdown', resumeAudio);
  window.addEventListener('keydown', resumeAudio);

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
    controls.dataset.extCameraLive = s.phase === 'live' ? '1' : '';
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

  const timecode = document.getElementById('mx-timecode');
  let lastTimecode = '';
  let lastAvSynchro = '';
  let lastMicState = '';
  const loop = new RenderLoop(engine.clock, (_alpha, tick) => {
    // Poll gamepads and flush coalesced input signals to store commands (ADR-0014) — the one
    // place resolveSignal fires, passing the tick purely. Then advance the timeline runners.
    gamepad.poll();
    coalescer.flush(engine.store.getSnapshot(), tick, (command) => engine.store.dispatch(command));
    // Advance the Auto Take / Auto Fade runners for this logical tick (ADR-0012). Idle is a
    // no-op: the reducer returns the same snapshot and the store skips notification.
    engine.store.dispatch({ type: 'ADVANCE_TIMELINE', tick });
    const snapshot = engine.store.getSnapshot();
    // A/V Synchro (§8.9): measure the envelope once and gate the bus effects with it —
    // a transient per-frame signal, never dispatched or stored (ADR-0010).
    const avPulsed = tap ? tap.activeEffects(snapshot.digitalEffect) : [];
    renderer.render(snapshot, tick, avPulsed);
    // Timecode chip on the Program monitor: the logical clock as mm:ss:ff at 60.
    if (timecode) {
      const seconds = Math.floor(tick / 60);
      const text = `${pad2(Math.floor(seconds / 60) % 60)}:${pad2(seconds % 60)}:${pad2(tick % 60)}`;
      if (text !== lastTimecode) {
        timecode.textContent = text;
        lastTimecode = text;
      }
    }
    // Console LED cue for the same pulsed set (the gating itself happened in render above).
    const active = avPulsed.join(' ');
    if (active !== lastAvSynchro) {
      controls.dataset.avSynchroActive = active;
      lastAvSynchro = active;
    }
    // Mic capture status, display-only (same transient-dataset precedent).
    const mic = audio ? audio.micStatus() : 'idle';
    if (mic !== lastMicState) {
      controls.dataset.micState = mic;
      lastMicState = mic;
    }
  });
  loop.start();
  setStatus(audio ? 'ready' : 'ready · audio unavailable');
}

boot().catch((error) => showCapabilityMessage(String(error)));
