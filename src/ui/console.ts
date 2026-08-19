// The operator console (ADR-0013, styled per docs/STYLEGUIDE.md): the full plate,
// composed from the connected hardware blocks in src/ui/blocks/ (ADR-0017 layer 3) —
// Source Selection (B-1), Matte (B-2), Audio (B-3), Colour Correction (B-4),
// Positioner (B-5), Digital Effect (C), Freeze/A-V Synchro, Mix/Wipe (D) with the
// T-bar lever, DSK, Fade, and Event Memory / Special Modes.
//
// The console binds each block imperatively (ADR-0017 tier 3): that stays correct no
// matter how the console itself was connected — a `for="id"` console's blocks are not
// descendants of the mixer, so ancestry discovery could not reach it from here.

import { ensureTheme } from './theme.js';
import { requestMixerContext } from './context.js';
import { defineBlocks } from './blocks/index.js';
import type { MxBlock } from './blocks/index.js';
import type { PanelStore } from '../state/store.js';
import type { PresetFileIo } from '../persistence/file-io.js';

/** The plate grid (docs/STYLEGUIDE.md): which block goes where. */
const BLOCK_LAYOUT: { tag: string; column: string; row: string }[] = [
  { tag: 'mx-source-block', column: '1', row: '1' },
  { tag: 'mx-matte-block', column: '2', row: '1' },
  { tag: 'mx-colour-correction-block', column: '3', row: '1' },
  { tag: 'mx-position-block', column: '4', row: '1' },
  { tag: 'mx-mixwipe-block', column: '5', row: '1 / span 4' },
  { tag: 'mx-digital-effect-block', column: '1 / span 2', row: '2' },
  { tag: 'mx-freeze-block', column: '3 / span 2', row: '2' },
  { tag: 'mx-audio-block', column: '1', row: '3' },
  { tag: 'mx-dsk-block', column: '2 / span 2', row: '3' },
  { tag: 'mx-fade-block', column: '4', row: '3' },
  { tag: 'mx-memory-block', column: '1 / span 4', row: '4' },
];

export class MxConsole extends HTMLElement {
  private store: PanelStore | null = null;
  private tickNow: () => number = () => 0;
  private presetIo: PresetFileIo | null = null;

  bind(store: PanelStore, tickNow: () => number = () => 0, presetIo: PresetFileIo | null = null): void {
    this.presetIo = presetIo;
    this.store = store;
    this.tickNow = tickNow;
    if (this.isConnected) this.build();
  }

  connectedCallback(): void {
    if (this.store) {
      this.build();
      return;
    }
    // No explicit bind(): resolve the nearest/`for=`-referenced mixer's context
    // (ADR-0017). The callback may fire later (the host boots asynchronously) or
    // never (no host) — until then the console stays empty. bind() always wins.
    requestMixerContext(this, (context) => {
      if (this.store) return;
      this.bind(context.store, context.tick, context.presetIo);
    });
  }

  private build(): void {
    const store = this.store;
    if (!store) return;
    ensureTheme();
    defineBlocks();
    this.textContent = '';

    const scroll = document.createElement('div');
    scroll.className = 'mx-plate-scroll';
    const plate = document.createElement('div');
    plate.className = 'mx-plate';
    scroll.appendChild(plate);

    for (const spec of BLOCK_LAYOUT) {
      const block = document.createElement(spec.tag) as MxBlock;
      block.style.gridColumn = spec.column;
      block.style.gridRow = spec.row;
      block.bind(store, this.tickNow, this.presetIo);
      plate.appendChild(block);
    }

    const foot = document.createElement('div');
    foot.className = 'mx-foot';
    const hints = [
      'Lever: drag, or ↑↓ (shift = fine). Auto Take glides it; press again to pause.',
      'Colour-correct button cycles blink → solid → off, as on the hardware.',
      'Matte on a bus + direct-out A/B → the substitute source button blinks.',
    ];
    for (const hint of hints) {
      const span = document.createElement('span');
      span.textContent = hint;
      foot.appendChild(span);
    }

    this.append(scroll, foot);
  }
}

let defined = false;

/** Define the element and the blocks it composes (once); static markup upgrades here. */
export function defineConsole(): void {
  if (!defined) {
    defineBlocks();
    customElements.define('mx-console', MxConsole);
    defined = true;
  }
}

/** Define the element (once) and return a bound instance for the given store. */
export function createConsole(store: PanelStore, tickNow: () => number = () => 0, presetIo: PresetFileIo | null = null): MxConsole {
  defineConsole();
  const console = document.createElement('mx-console') as MxConsole;
  console.bind(store, tickNow, presetIo);
  return console;
}
