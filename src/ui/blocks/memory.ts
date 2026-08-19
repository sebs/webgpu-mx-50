// H-1/H-2 Event memory + Special modes (reference §13/§14) as a connected block
// (ADR-0017). The preset Export/Import pair appears only when the connection carries
// a PresetFileIo — a storage-less host (no `persist`) has none.

import { MxBlock } from './base.js';
import { ledButton } from './parts.js';
import { SPECIAL_MACROS } from '../../core/special-mode.js';
import type { PanelStore } from '../../state/store.js';

export class MxMemoryBlock extends MxBlock {
  protected render(store: PanelStore): void {
    this.classList.add('mx-block');
    this.setAttribute('role', 'group');
    this.setAttribute('aria-label', 'Event memory and special modes');
    this.style.display = 'grid';
    this.style.gridTemplateColumns = '1fr 1fr';
    this.style.gap = '16px';

    const memory = document.createElement('div');
    memory.style.cssText = 'display:flex;flex-direction:column;gap:9px';
    const memHead = document.createElement('div');
    memHead.className = 'mx-block-head';
    const memTitle = document.createElement('span');
    memTitle.textContent = 'Event memory';
    const memId = document.createElement('span');
    memId.className = 'mx-block-id';
    memId.textContent = 'H-1';
    memHead.append(memTitle, memId);
    memory.appendChild(memHead);

    const memModes = document.createElement('div');
    memModes.className = 'mx-row';
    const memoryBtn = ledButton({
      label: 'Memory', title: 'Latch store-mode: the next EVENT NO. stores the panel snapshot',
      onClick: () => store.dispatch({ type: 'PRESS_MEMORY' }),
    });
    this.refresh.push((s) => memoryBtn.set(s.memory.memoryArmed ? 'on' : 'off'));
    const clear = ledButton({ label: 'Clear all', title: 'Mass-clear every stored event', onClick: () => store.dispatch({ type: 'CLEAR_ALL_SLOTS' }) });
    memModes.append(memoryBtn.el, clear.el);
    // Portable presets (ADR-0015): export/import the 8-slot bank as versioned JSON.
    // The block stays store-only — the file glue owns persistence and the one
    // LOAD_BANK dispatch; feedback is sticky until the next export/import.
    if (this.presetIo) {
      const io = this.presetIo;
      const note = document.createElement('span');
      note.className = 'mx-note';
      const exportBtn = ledButton({
        label: 'Export', title: 'Download the 8-slot bank as versioned JSON',
        onClick: () => {
          note.textContent = io.exportPreset('bank');
          note.setAttribute('data-err', 'false');
        },
      });
      const importBtn = ledButton({
        label: 'Import', title: 'Load a bank JSON file — replaces all 8 slots',
        onClick: () =>
          io.importPreset((text, ok) => {
            note.textContent = text;
            note.setAttribute('data-err', String(!ok));
          }),
      });
      memModes.append(exportBtn.el, importBtn.el);
      memory.appendChild(memModes);
      memory.appendChild(note);
    } else {
      memory.appendChild(memModes);
    }

    const slots = this.grid(8, true);
    for (let n = 1; n <= 8; n++) {
      const button = ledButton({
        label: String(n), shape: 'minibar', stack: true, mono: true,
        title: `Event ${n} — store when MEMORY is latched, else arm recall (Auto Take runs it)`,
        onClick: () => store.dispatch({ type: 'PRESS_EVENT_NO', button: ((n - 1) % 4) + 1, shift: n > 4 }),
      });
      this.refresh.push((s) => {
        const armed = s.memory.armedSlot === n;
        const occupied = s.memory.slots[n - 1] !== null && s.memory.slots[n - 1] !== undefined;
        button.setTone(armed ? 'amber' : 'green');
        button.set(armed ? 'blink' : occupied ? 'on' : 'off');
      });
      slots.appendChild(button.el);
    }
    memory.appendChild(slots);

    const special = document.createElement('div');
    special.style.cssText = 'display:flex;flex-direction:column;gap:9px';
    const spHead = document.createElement('div');
    spHead.className = 'mx-block-head';
    const spTitle = document.createElement('span');
    spTitle.textContent = 'Special modes';
    const spId = document.createElement('span');
    spId.className = 'mx-block-id';
    spId.textContent = 'H-2';
    spHead.append(spTitle, spId);
    special.appendChild(spHead);

    const spToggleRow = document.createElement('div');
    spToggleRow.className = 'mx-row';
    const spToggle = ledButton({
      label: 'Mem + shift', title: 'The MEMORY+SHIFT chord: enter/leave Special Mode',
      onClick: () => store.dispatch({ type: 'PRESS_MEMORY_SHIFT' }),
    });
    this.refresh.push((s) => spToggle.set(s.specialMode.active ? 'on' : 'off'));
    spToggleRow.appendChild(spToggle.el);
    special.appendChild(spToggleRow);

    const macros = this.grid(4, true);
    for (const macro of SPECIAL_MACROS) {
      const button = ledButton({
        label: macro.name, shape: 'minibar', stack: true, title: macro.character || macro.name,
        onClick: () =>
          store.dispatch({ type: 'SELECT_SPECIAL_MACRO', button: (((macro.ordinal - 1) % 4) + 1) as 1 | 2 | 3 | 4, shift: macro.ordinal > 4 }),
      });
      this.refresh.push((s) => button.set(s.specialMode.armed === macro.id ? 'blink' : 'off'));
      macros.appendChild(button.el);
    }
    special.appendChild(macros);

    this.append(memory, special);
  }
}
