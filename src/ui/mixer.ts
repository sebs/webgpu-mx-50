// <mx-mixer> — the composable host element (ADR-0017). It owns what the demo boot
// script used to own: WebGPU capability detection and device init, the headless engine
// (ADR-0011/0012), the SourceRegistry (ADR-0008), the renderer, the render loop, and —
// behind the opt-in `persist` attribute — the ADR-0015 storage tiers. Its rendered
// content is the Program Out canvas.
//
// Components discover it through the context protocol (./context.ts); the page-level
// composition root may additionally use the element's richer properties (engine, gpu,
// registry, renderer, persistence, beforeFrame) — that surface is for embedders, and
// is never transported by the context.
//
// Lifecycle contract: 'mx-ready' is dispatched SYNCHRONOUSLY before the first frame,
// so a listener can bind real sources into the registry with no wrong-source frame
// ever presented (the registry is the swap point — ADR-0008). 'mx-unavailable' fires
// when WebGPU is missing; it is cancelable, and preventDefault() suppresses the host's
// inline fallback message for pages that render their own.

import { detectWebGPU, WEBGPU_REQUIREMENT_MESSAGE } from '../gpu/capabilities.js';
import { initGpu } from '../gpu/device.js';
import { createEngine } from '../app.js';
import { MatteSource } from '../sources/matte-source.js';
import { VideoSource } from '../sources/video-source.js';
import { SourceRegistry } from '../sources/registry.js';
import { Renderer } from '../engine/renderer.js';
import { RenderLoop } from '../engine/loop.js';
import { createPersistence } from '../persistence/persistence.js';
import { IndexedDbBlobBackend, LocalStorageBackend, MemoryStorageBackend } from '../persistence/backend.js';
import { attachPersistence } from '../persistence/subscriber.js';
import { createStillStore } from '../persistence/still-store.js';
import { createPresetFileIo } from '../persistence/file-io.js';
import { ensureTheme } from './theme.js';
import { defineConsole } from './console.js';
import { MIXER_CONTEXT_REQUEST, MixerContextRequest } from './context.js';
import { SOURCE_SLOTS } from '../core/types.js';
import type { MixerContext, Unsubscribe } from './context.js';
import type { Engine } from '../app.js';
import type { GpuContext } from '../gpu/device.js';
import type { Persistence } from '../persistence/persistence.js';
import type { PresetFileIo } from '../persistence/file-io.js';
import type { PanelStore } from '../state/store.js';
import type { AvSynchroEffect, PanelState } from '../state/state.js';
import type { Command } from '../state/commands.js';
import type { Size } from '../core/types.js';

const STYLE = `
mx-mixer { display: block; position: relative; background: #000; }
mx-mixer > canvas { display: block; width: 100%; height: auto; background: #000; }
mx-mixer .mx-mixer-unavailable { padding: 1rem 1.25rem; font: 13px/1.5 system-ui, sans-serif; }
`;

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720;

function dimension(el: HTMLElement, name: string, fallback: number): number {
  const raw = el.getAttribute(name);
  const value = raw === null ? NaN : parseInt(raw, 10);
  return isFinite(value) && value > 0 ? value : fallback;
}

export class MxMixer extends HTMLElement {
  private engineRef: Engine | null = null;
  private gpuRef: GpuContext | null = null;
  private rendererRef: Renderer | null = null;
  private registryRef: SourceRegistry | null = null;
  private persistenceRef: Persistence | null = null;
  private presetIoRef: PresetFileIo | null = null;
  private loop: RenderLoop | null = null;
  private ctx: MixerContext | null = null;
  private booted = false;

  private readonly pendingRequests: Array<(context: MixerContext) => void> = [];
  private readonly readyResolvers: Array<(context: MixerContext) => void> = [];
  private readonly preFramers = new Set<(tick: number) => void>();
  private readonly framers = new Set<(state: PanelState, tick: number) => void>();

  /** Seam for the page-owned A/V-Synchro envelope measurement (ADR-0010). */
  avPulse: ((state: PanelState) => readonly AvSynchroEffect[]) | null = null;

  constructor() {
    super();
    // Answer (or queue) context requests from descendants and `for=`-referenced
    // components. stopPropagation scopes discovery to the nearest host (ADR-0017).
    this.addEventListener(MIXER_CONTEXT_REQUEST, (event) => {
      const request = event as MixerContextRequest;
      event.stopPropagation();
      if (this.ctx) request.provide(this.ctx);
      else this.pendingRequests.push(request.provide);
    });
  }

  // --- embedder surface (composition roots only — never in the context) ------------

  get engine(): Engine | null {
    return this.engineRef;
  }

  get gpu(): GpuContext | null {
    return this.gpuRef;
  }

  get renderer(): Renderer | null {
    return this.rendererRef;
  }

  get registry(): SourceRegistry | null {
    return this.registryRef;
  }

  get persistence(): Persistence | null {
    return this.persistenceRef;
  }

  get context(): MixerContext | null {
    return this.ctx;
  }

  /** Convenience passthrough to the store's one write path (ADR-0011). */
  dispatch(command: Command): void {
    this.engineRef?.store.dispatch(command);
  }

  /** Input-pumping hook, called BEFORE the timeline advances and the frame renders
   *  (the ADR-0014 coalescer flush and gamepad poll belong here). */
  beforeFrame(fn: (tick: number) => void): Unsubscribe {
    this.preFramers.add(fn);
    return () => {
      this.preFramers.delete(fn);
    };
  }

  /** Display hook, called AFTER each rendered frame with the presented snapshot. */
  onFrame(fn: (state: PanelState, tick: number) => void): Unsubscribe {
    this.framers.add(fn);
    return () => {
      this.framers.delete(fn);
    };
  }

  /** Resolves once the host is running (after 'mx-ready'). */
  whenReady(): Promise<MixerContext> {
    if (this.ctx) return Promise.resolve(this.ctx);
    return new Promise((resolve) => this.readyResolvers.push(resolve));
  }

  // --- lifecycle --------------------------------------------------------------------

  connectedCallback(): void {
    if (this.booted) {
      this.loop?.start();
      return;
    }
    this.booted = true;
    // Defer one microtask so listeners attached in the same task as the upgrade
    // (define → connectedCallback) can catch a synchronous 'mx-unavailable'.
    void Promise.resolve().then(() => this.boot());
  }

  disconnectedCallback(): void {
    this.loop?.stop();
  }

  private async boot(): Promise<void> {
    ensureTheme();
    if (!document.getElementById('mx-mixer-style')) {
      const style = document.createElement('style');
      style.id = 'mx-mixer-style';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }

    const capability = detectWebGPU();
    if (!capability.ok) {
      this.fail(WEBGPU_REQUIREMENT_MESSAGE);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = dimension(this, 'width', DEFAULT_WIDTH);
    canvas.height = dimension(this, 'height', DEFAULT_HEIGHT);
    canvas.setAttribute('aria-label', 'Program output');
    this.insertBefore(canvas, this.firstChild);

    let gpu: GpuContext;
    try {
      gpu = await initGpu(canvas);
    } catch (error) {
      canvas.remove();
      this.fail(`${WEBGPU_REQUIREMENT_MESSAGE} (${String(error)})`);
      return;
    }

    // Storage is opt-in (ADR-0017): without `persist`, embedding a mixer never writes
    // the host page's localStorage/IndexedDB tiers.
    const persistence = this.hasAttribute('persist')
      ? createPersistence(new LocalStorageBackend(window.localStorage))
      : null;
    const engine = createEngine(persistence ? persistence.restoreOnBoot() : undefined);

    const size: Size = { width: canvas.width, height: canvas.height };
    const matte = new MatteSource(gpu.device, size);
    const registry = new SourceRegistry();
    // Slots default to the Matte generator until an embedder binds real feeds — the
    // registry is re-read every frame, so later set() calls are race-free (ADR-0008).
    for (const slot of SOURCE_SLOTS) registry.set(slot, matte);
    registry.set('matte', matte);

    // `src` — the single-tag playback case: the clip becomes Source 1 on bus A.
    const src = this.getAttribute('src');
    if (src) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.playsInline = true;
      video.src = src;
      void video.play().catch(() => undefined);
      registry.set(1, new VideoSource(gpu.device, video));
      engine.store.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 });
      engine.store.dispatch({ type: 'SET_LEVER', position: 0 });
      engine.store.dispatch({ type: 'SET_PROGRAM_OUT', mode: 'effect' });
    }

    await registry.acquireAll();
    const renderer = new Renderer({ gpu, registry, generated: [], matte, size });

    if (persistence) {
      const stills = createStillStore(new IndexedDbBlobBackend(), persistence, renderer);
      attachPersistence(engine.store, persistence, stills);
      const snap = engine.store.getSnapshot();
      void stills.sweepOrphans(snap.memory.slots, [snap.positioner.stillId]);
      if (snap.positioner.sceneGrabber && snap.positioner.stillId != null) {
        void stills.recallStill(snap.positioner.stillId);
      }
      this.presetIoRef = createPresetFileIo({ persistence, store: engine.store, now: () => new Date() });
    }

    const preset = this.getAttribute('preset');
    if (preset) await this.loadPresetUrl(preset, engine.store);

    this.engineRef = engine;
    this.gpuRef = gpu;
    this.rendererRef = renderer;
    this.registryRef = registry;
    this.persistenceRef = persistence;

    const context: MixerContext = {
      store: engine.store,
      tick: () => engine.clock.tick,
      presetIo: this.presetIoRef,
      onFrame: (fn) => this.onFrame(fn),
    };
    this.ctx = context;
    for (const provide of this.pendingRequests.splice(0)) provide(context);

    // One logical frame (ADR-0012): pump inputs, advance the timeline runners, render
    // the snapshot, then let display hooks reflect what was presented.
    this.loop = new RenderLoop(engine.clock, (_alpha, tick) => {
      for (const fn of this.preFramers) fn(tick);
      engine.store.dispatch({ type: 'ADVANCE_TIMELINE', tick });
      const snapshot = engine.store.getSnapshot();
      renderer.render(snapshot, tick, this.avPulse ? this.avPulse(snapshot) : []);
      for (const fn of this.framers) fn(snapshot, tick);
    });

    if (this.hasAttribute('controls') && !this.querySelector('mx-console')) {
      defineConsole();
      this.appendChild(document.createElement('mx-console'));
    }

    // Synchronous window: listeners may swap registry slots before the first frame.
    this.dispatchEvent(new CustomEvent<MixerContext>('mx-ready', { detail: context }));
    this.loop.start();
    for (const resolve of this.readyResolvers.splice(0)) resolve(context);
  }

  /**
   * Fetch a preset URL and route it through the SAME import path as a file import
   * (ADR-0015): importPreset over an ephemeral in-memory persistence sanitises and
   * versions it, then the one LOAD path makes it live.
   */
  private async loadPresetUrl(url: string, store: PanelStore): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.text();
      const staging = createPersistence(new MemoryStorageBackend());
      const result = staging.importPreset(json);
      if (result.ok === false) {
        throw new Error(`preset rejected (${result.reason})`);
      }
      if (result.target === 'bank') {
        store.dispatch({ type: 'LOAD_BANK', slots: staging.loadBank() });
      } else if (result.target === 'fieldPreset') {
        staging.saveSettings({ reset: 'off' });
        store.dispatch({ type: 'LOAD_STATE', state: staging.restoreOnBoot() });
      }
      // target 'settings' carries no live panel state — nothing to make live here.
    } catch (error) {
      this.dispatchEvent(new CustomEvent<string>('mx-preset-error', { detail: String(error) }));
    }
  }

  private fail(message: string): void {
    const proceed = this.dispatchEvent(
      new CustomEvent<string>('mx-unavailable', { detail: message, cancelable: true }),
    );
    if (!proceed) return; // the page renders its own fallback
    const box = document.createElement('div');
    box.className = 'mx-mixer-unavailable';
    box.setAttribute('role', 'alert');
    box.textContent = message;
    this.appendChild(box);
  }
}

let defined = false;

/** Define the element (once); static markup upgrades at this call. */
export function defineMixer(): void {
  if (!defined) {
    customElements.define('mx-mixer', MxMixer);
    defined = true;
  }
}
