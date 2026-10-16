// The connected-block base (ADR-0017 layer 3): every hardware block IS a custom
// element carrying the `.mx-block` chrome itself, so it works identically as a plate
// child inside <mx-console>, as a standalone descendant of <mx-mixer>, connected by
// `for="id"` from anywhere in the page, or bound imperatively.
//
// Same contract as the console it was split from: a stateless view of the single
// store (ADR-0011). render() builds the controls into `this` and registers refresh
// functions; every control mutates only by dispatching typed commands, and the block
// subscribes itself for repaints — the render loop is never touched (ADR-0012).

import { ensureTheme } from '../theme.js';
import { requestMixerContext } from '../context.js';
import { BLOCK_REFERENCE, referenceLine } from './reference.js';
import type { MxSlider } from '../primitives/slider.js';
import type { PanelStore } from '../../state/store.js';
import type { PanelState } from '../../state/state.js';
import type { PresetFileIo } from '../../persistence/file-io.js';

export abstract class MxBlock extends HTMLElement {
  protected store: PanelStore | null = null;
  protected tickNow: () => number = () => 0;
  protected presetIo: PresetFileIo | null = null;
  private unsubscribe: (() => void) | null = null;
  protected readonly refresh: Array<(state: PanelState) => void> = [];

  /** Imperative connection (ADR-0017 tier 3) — always wins over a later context. */
  bind(store: PanelStore, tickNow: () => number = () => 0, presetIo: PresetFileIo | null = null): void {
    this.store = store;
    this.tickNow = tickNow;
    this.presetIo = presetIo;
    if (this.isConnected) this.build();
  }

  connectedCallback(): void {
    if (this.store) {
      this.build();
      return;
    }
    // No explicit bind(): resolve the nearest/`for=`-referenced mixer's context
    // (ADR-0017). The callback may fire later (the host boots asynchronously) or
    // never (no host) — until then the block stays empty.
    requestMixerContext(this, (context) => {
      if (this.store) return;
      this.bind(context.store, context.tick, context.presetIo);
    });
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Build the block's controls into `this`, registering `refresh` reflectors. */
  protected abstract render(store: PanelStore): void;

  private build(): void {
    const store = this.store;
    if (!store) return;
    ensureTheme();
    this.textContent = '';
    this.refresh.length = 0;
    this.render(store);
    this.unsubscribe?.();
    this.unsubscribe = store.subscribe((next) => this.reflect(next));
    this.reflect(store.getSnapshot());
  }

  private reflect(state: PanelState): void {
    for (const fn of this.refresh) fn(state);
  }

  /** Apply the block chrome (class, group role, header) to `this`; returns the body appender. */
  protected chrome(title: string, id: string): (child: HTMLElement) => void {
    this.classList.add('mx-block');
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', title);
    const head = document.createElement('div');
    head.className = 'mx-block-head';
    const name = document.createElement('span');
    name.textContent = title;
    const chip = document.createElement('span');
    chip.className = 'mx-block-id';
    chip.textContent = id;
    head.append(name, chip);
    // Provenance on hover: which manual section and which feature file this block is.
    const ref = BLOCK_REFERENCE[this.localName];
    if (ref) head.title = referenceLine(ref);
    this.appendChild(head);
    return (child) => this.appendChild(child);
  }

  protected grid(columns: number, tight = false): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mx-grid' + (tight ? ' tight' : '');
    el.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    return el;
  }

  protected sliderRow(
    label: string,
    slider: MxSlider,
    format: ((state: PanelState) => string) | null,
    labelWidth?: number,
  ): { row: HTMLElement; value: HTMLElement } {
    const row = document.createElement('div');
    row.className = 'mx-srow';
    const name = document.createElement('span');
    name.className = 'slabel';
    if (labelWidth !== undefined) name.style.width = `${labelWidth}px`;
    name.textContent = label;
    row.append(name, slider);
    const value = document.createElement('span');
    value.className = 'svalue';
    if (format) {
      row.appendChild(value);
      this.refresh.push((s) => (value.textContent = format(s)));
    }
    return { row, value };
  }
}
