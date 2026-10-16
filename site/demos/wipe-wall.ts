// D4 — the wipe wall (docs/WEBSITE.md §5 Tier 1): all 28 forward patterns, live, on real
// video, with the lever sweeping A → B → A; click one to see it large.
//
// 28 <mx-mixer> hosts would mean 28 engines and 112 feed videos, so the wall is its own
// composition root over the same parts a host uses: ONE shared GPUDevice, ONE
// SourceRegistry holding two pattern feeds (drawn once per frame; VideoSource's
// frame-presented gating means each frame is imported once, not once per cell), and one
// small Renderer per cell, each reading its own PanelStore. Every cell's state is built
// by real commands (site/wall.ts) and the only thing the wall does per frame is
// SET_LEVER — the pixels are the shipping WGSL, nothing is drawn by the page.
//
// Budget rule (§5): only cells on screen render, no frames are even requested while the
// wall is off screen or the tab is hidden (runWhileVisible), and the GPU is not touched
// until the wall first scrolls into view. The root carries the
// bench contract (.mx-live → .ready / .unavailable) so the smoke test and the poster
// capture treat it like any other bench.

import { detectWebGPU } from '../../src/gpu/capabilities.js';
import { sharedGpuDevice, configureCanvas } from '../../src/gpu/device.js';
import { createPatternFeed } from '../../src/ui/pattern-feeds.js';
import type { PatternFeed } from '../../src/ui/pattern-feeds.js';
import { VideoSource } from '../../src/sources/video-source.js';
import { MatteSource } from '../../src/sources/matte-source.js';
import { SourceRegistry } from '../../src/sources/registry.js';
import { Renderer } from '../../src/engine/renderer.js';
import { PanelStore } from '../../src/state/store.js';
import { factoryState } from '../factory.js';
import { numberToPattern, squareShapeName, WIPE_FAMILIES, VARIANT_COUNT } from '../../src/core/wipe.js';
import { SOURCE_SLOTS } from '../../src/core/types.js';
import type { WipeEdge } from '../../src/state/state.js';
import { WALL_PATTERNS, DEFAULT_WALL_OPTIONS, wallCommands, wallLabel, leverAt } from '../wall.js';
import type { WallOptions } from '../wall.js';
import { POSTERS } from '../posters.js';
import { DemoElement, defineDemo, reducedMotion, field, range, runWhileVisible } from './base.js';
import { el, esc } from '../shell.js';
import { capturedMedia } from './captured.js';

const WALL_ID = 'bench-wipe-wall';
const CELL = { width: 320, height: 180 };
const FOCUS = { width: 960, height: 540 };

interface Cell {
  readonly n: number;
  readonly store: PanelStore;
  readonly button: HTMLButtonElement;
  readonly canvas: HTMLCanvasElement;
  renderer: Renderer | null;
  visible: boolean;
}

/** Put `store` on pattern `n` with `opts`: a fresh factory panel, then the wall's commands. */
function applyPattern(store: PanelStore, n: number, opts: WallOptions): void {
  store.dispatch({ type: 'LOAD_STATE', state: factoryState() });
  const commands = wallCommands(n, opts);
  for (let i = 0; i < commands.length; i++) store.dispatch(commands[i]!);
}

function patternStore(n: number, opts: WallOptions): PanelStore {
  const store = new PanelStore(factoryState());
  applyPattern(store, n, opts);
  return store;
}

function describe(n: number): string {
  const p = numberToPattern(n);
  const shape = p.family === 'square' ? ` (${squareShapeName(p.variant)})` : '';
  return `${p.family} · variant ${p.variant + 1}${shape}`;
}

class WipeWall extends DemoElement {
  protected render(): void {
    // A reconnect re-runs render(): start from an empty element so it builds one fresh wall.
    this.textContent = '';

    // Teardown is registered NOW, not after the async boot: a disconnect mid-boot must still
    // stop everything. Each resource registers its release as it is created; boot checks
    // `disposed` after every await and stops building once the element is gone.
    let disposed = false;
    const releases: Array<() => void> = [];
    this.onDispose(() => {
      disposed = true;
      for (let i = releases.length - 1; i >= 0; i--) releases[i]!();
      releases.length = 0;
    });

    let opts: WallOptions = DEFAULT_WALL_OPTIONS;
    let auto = !reducedMotion();
    let manualLever = 0.5;
    let selected = 9;

    const root = el('div', { class: 'mx-live mx-wall', attrs: { id: WALL_ID } });

    // --- focus view
    const focus = el('div', { class: 'mx-wall-focus' });
    const focusCanvas = document.createElement('canvas');
    focusCanvas.width = FOCUS.width;
    focusCanvas.height = FOCUS.height;
    focusCanvas.className = 'mx-wall-screen';
    focusCanvas.setAttribute('aria-label', 'The selected wipe pattern, large');
    const side = el('div', { class: 'mx-wall-side' });
    const number = el('div', { class: 'mx-readout big' });
    const name = el('div', { class: 'mx-dim', attrs: { style: 'margin:8px 0 16px;font-size:14px' } });
    side.append(number, name);

    const edgeSel = document.createElement('select');
    edgeSel.className = 'mx-input';
    edgeSel.setAttribute('aria-label', 'Edge');
    const edges: Array<[WipeEdge, string]> = [
      ['hard', 'Hard'],
      ['border-narrow', 'Border · narrow'],
      ['border-wide', 'Border · wide'],
      ['soft-narrow', 'Soft · narrow'],
      ['soft-wide', 'Soft · wide'],
    ];
    for (const [value, label] of edges) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      edgeSel.appendChild(o);
    }
    edgeSel.value = opts.edge;
    const compSel = document.createElement('select');
    compSel.className = 'mx-input';
    compSel.setAttribute('aria-label', 'Compression');
    for (const [value, label] of [['0', 'Off'], ['1', 'Incoming'], ['2', 'Both']] as const) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = label;
      compSel.appendChild(o);
    }
    const reverse = el('button', { class: 'mx-btn', html: `<span class="led"></span>Reverse (+128)`, attrs: { type: 'button', 'aria-pressed': 'false' } });
    const autoBtn = el('button', { class: 'mx-btn', html: `<span class="led"></span>Auto lever`, attrs: { type: 'button', 'aria-pressed': auto ? 'true' : 'false' } });
    const lever = range({
      min: 0,
      max: 1,
      step: 0.005,
      value: manualLever,
      label: 'Lever (stops the automatic sweep)',
      onInput: (v) => {
        manualLever = v;
        auto = false;
        autoBtn.setAttribute('aria-pressed', 'false');
      },
    });
    const controls = el('div', { class: 'mx-grid', attrs: { style: 'gap:12px' } });
    controls.append(field('Edge', edgeSel), field('Compression', compSel), field('Lever', lever));
    const toggles = el('div', { class: 'mx-row' });
    toggles.append(reverse, autoBtn);
    side.append(controls, toggles);
    const status = el('span', { class: 'mx-chip', html: `<span class="led"></span>starts when on screen`, attrs: { style: 'margin-top:14px;align-self:flex-start' } });
    side.appendChild(status);
    focus.append(focusCanvas, side);
    root.appendChild(focus);

    // --- the grid: one row per family, one column per variant
    const grid = el('div', { class: 'mx-wall-grid', attrs: { 'data-poster': '' } });
    const cells: Cell[] = [];
    for (let f = 0; f < WIPE_FAMILIES.length; f++) {
      grid.appendChild(el('div', { class: 'mx-wall-family mx-label', text: WIPE_FAMILIES[f]! }));
      for (let v = 0; v < VARIANT_COUNT; v++) {
        const n = WALL_PATTERNS[f * VARIANT_COUNT + v]!;
        const button = el('button', { class: 'mx-wall-cell', attrs: { type: 'button', 'aria-label': `Pattern ${wallLabel(n, false)}: ${describe(n)}` } });
        const canvas = document.createElement('canvas');
        canvas.width = CELL.width;
        canvas.height = CELL.height;
        const tag = el('span', { class: 'mx-wall-tag', text: wallLabel(n, false) });
        button.append(canvas, tag);
        grid.appendChild(button);
        const cell: Cell = { n, store: patternStore(n, opts), button, canvas, renderer: null, visible: false };
        button.addEventListener('click', () => select(n));
        cells.push(cell);
      }
    }
    root.appendChild(grid);
    this.appendChild(root);

    const focusStore = patternStore(selected, opts);

    // Poster capture (scripts/capture-posters.mjs): hold the lever mid-throw, where every
    // pattern is visibly half open, instead of wherever the sweep happens to be.
    root.addEventListener('mx-poster-prepare', () => {
      auto = false;
      manualLever = 0.45;
      lever.value = '0.45';
      autoBtn.setAttribute('aria-pressed', 'false');
    });

    const relabel = (): void => {
      number.textContent = wallLabel(selected, opts.reverse);
      name.textContent = describe(selected) + (opts.reverse ? ' · reversed' : '');
      for (const c of cells) {
        c.button.setAttribute('aria-pressed', c.n === selected ? 'true' : 'false');
        (c.button.lastElementChild as HTMLElement).textContent = wallLabel(c.n, opts.reverse);
      }
    };
    const select = (n: number): void => {
      selected = n;
      applyPattern(focusStore, n, opts);
      relabel();
    };
    const rebuild = (): void => {
      for (const c of cells) applyPattern(c.store, c.n, opts);
      applyPattern(focusStore, selected, opts);
      relabel();
    };
    edgeSel.addEventListener('change', () => {
      opts = { ...opts, edge: edgeSel.value as WipeEdge };
      rebuild();
    });
    compSel.addEventListener('change', () => {
      opts = { ...opts, compression: Number(compSel.value) as 0 | 1 | 2 };
      rebuild();
    });
    reverse.addEventListener('click', () => {
      opts = { ...opts, reverse: !opts.reverse };
      reverse.setAttribute('aria-pressed', opts.reverse ? 'true' : 'false');
      rebuild();
    });
    autoBtn.addEventListener('click', () => {
      auto = !auto;
      autoBtn.setAttribute('aria-pressed', auto ? 'true' : 'false');
    });
    relabel();

    const unavailable = (reason: string): void => {
      root.classList.add('unavailable');
      status.innerHTML = `<span class="led"></span>needs WebGPU`;
      focus.hidden = true;
      if (POSTERS.indexOf(WALL_ID) !== -1) {
        grid.hidden = true;
        const still = el('div', { class: 'mx-bench-screen poster', html: capturedMedia(WALL_ID, 'the wipe wall') });
        root.insertBefore(still, grid);
      }
      const note = el('p', {
        class: 'mx-dim',
        html: `The wall is the real WebGPU renderer, and this browser cannot start it (${esc(reason)}). The dialer and the geometry scope above run without it.`,
        attrs: { style: 'margin:12px 0 0;max-width:62ch' },
      });
      root.appendChild(note);
    };

    // --- GPU boot on first sight
    let started = false;
    const boot = async (): Promise<void> => {
      if (!detectWebGPU().ok) {
        unavailable('no navigator.gpu');
        return;
      }
      const device = await sharedGpuDevice();
      if (disposed) return;
      const feeds: PatternFeed[] = [createPatternFeed(2), createPatternFeed(3)]; // rings on A, checker on B
      for (const feed of feeds) {
        releases.push(() => {
          const stream = feed.video.srcObject as MediaStream | null;
          if (stream) stream.getTracks().forEach((track) => track.stop());
          feed.video.pause();
          feed.video.srcObject = null;
        });
      }
      const registry = new SourceRegistry();
      const matte = new MatteSource(device, FOCUS);
      const videoA = new VideoSource(device, feeds[0]!.video);
      const videoB = new VideoSource(device, feeds[1]!.video);
      releases.push(() => {
        videoA.release(); // cancels its frame callback, destroys its texture
        videoB.release();
        matte.release();
      });
      for (const slot of SOURCE_SLOTS) registry.set(slot, matte);
      registry.set('matte', matte);
      registry.set(1, videoA);
      registry.set(2, videoB);
      await registry.acquireAll();
      if (disposed) return; // the releases above already ran

      // The Renderer has no destroy(); unconfiguring each canvas drops its swapchain, and the
      // passes' textures go with the last reference.
      const contexts: GPUCanvasContext[] = [];
      releases.push(() => {
        for (const c of cells) c.renderer = null;
        for (const context of contexts) context.unconfigure();
      });
      const makeRenderer = (canvas: HTMLCanvasElement, size: { width: number; height: number }): Renderer => {
        const gpu = configureCanvas(canvas, device);
        contexts.push(gpu.context);
        return new Renderer({ gpu, registry, generated: [], matte, size });
      };
      const focusRenderer = makeRenderer(focusCanvas, FOCUS);
      for (const c of cells) c.renderer = makeRenderer(c.canvas, CELL);

      const io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const cell = cells.filter((c) => c.button === entry.target)[0];
          if (cell) cell.visible = entry.isIntersecting;
        }
      });
      for (const c of cells) io.observe(c.button);
      let focusVisible = true;
      const focusIo = new IntersectionObserver((entries) => {
        focusVisible = entries[entries.length - 1]!.isIntersecting;
      });
      focusIo.observe(focusCanvas);

      // runWhileVisible requests frames only while the wall is on screen and the tab is
      // visible — no idle wakeups once it is scrolled away. The lever keeps its own clock so
      // the sweep continues where it was rather than restarting each time it comes back.
      const t0 = performance.now();
      let frame = 0;
      const stop = runWhileVisible(root, () => {
        const anyVisible = focusVisible || cells.some((c) => c.visible);
        if (!anyVisible) return;
        const seconds = (performance.now() - t0) / 1000;
        frame++;
        for (const feed of feeds) feed.draw(seconds, frame);
        const position = auto ? leverAt(seconds) : manualLever;
        if (auto) lever.value = String(position);
        if (focusVisible) {
          focusStore.dispatch({ type: 'SET_LEVER', position });
          focusRenderer.render(focusStore.getSnapshot(), frame);
        }
        for (const c of cells) {
          if (!c.visible || !c.renderer) continue;
          c.store.dispatch({ type: 'SET_LEVER', position });
          c.renderer.render(c.store.getSnapshot(), frame);
        }
      });
      releases.push(() => {
        stop();
        io.disconnect();
        focusIo.disconnect();
      });

      root.classList.add('ready');
      status.className = 'mx-chip live';
      status.innerHTML = `<span class="led"></span>live · ${cells.length + 1} renderers, one device`;
    };

    const first = new IntersectionObserver((entries) => {
      if (started || !entries[entries.length - 1]!.isIntersecting) return;
      started = true;
      first.disconnect();
      // Anything that throws after the first await — no adapter, a canvas that will not take
      // a WebGPU context, a pass constructor — lands here, so the wall always settles on
      // .ready or .unavailable and says why.
      boot().catch((error: unknown) => unavailable(String(error).replace(/^Error:\s*/, '').replace(/\.$/, '')));
    });
    first.observe(root);
    releases.push(() => first.disconnect());
  }
}

defineDemo('mx-demo-wipe-wall', WipeWall);
