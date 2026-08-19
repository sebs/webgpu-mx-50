// B-1 Source selection + Program Out (reference §2/§3) as a connected block (ADR-0017).

import { MxBlock } from './base.js';
import { ledButton } from './parts.js';
import type { PanelStore } from '../../state/store.js';
import type { BusId, BusSource } from '../../core/types.js';
import type { BusState, ProgramOut } from '../../state/state.js';

const SOURCE_CHOICES: { label: string; value: BusSource }[] = [
  { label: '1', value: 1 }, { label: '2', value: 2 }, { label: '3', value: 3 }, { label: '4', value: 4 },
  { label: 'Matte', value: 'matte' },
];

export class MxSourceBlock extends MxBlock {
  protected render(store: PanelStore): void {
    const body = this.chrome('Source selection', 'B-1');

    const note = document.createElement('span');
    note.className = 'mx-note';

    for (const bus of ['A', 'B'] as BusId[]) {
      const row = document.createElement('div');
      row.className = 'mx-row';
      const busLabel = document.createElement('span');
      busLabel.style.cssText = 'width:12px;font:500 10px/1 var(--mx-font);color:var(--mx-label-bright)';
      busLabel.textContent = bus;
      const grid = this.grid(5);
      grid.style.flex = '1';
      for (const choice of SOURCE_CHOICES) {
        const button = ledButton({
          label: choice.label, shape: 'bar', stack: true,
          title: `${bus}-bus: ${choice.value === 'matte' ? 'internal Matte' : `Source ${choice.label}`}`,
          onClick: () => store.dispatch({ type: 'ASSIGN_SOURCE', bus, source: choice.value }),
        });
        this.refresh.push((s) => {
          const busState: BusState = bus === 'A' ? s.busA : s.busB;
          const selected = busState.source === choice.value;
          const substitute =
            busState.source === 'matte' && s.programOut === bus && choice.value === busState.substituteSource;
          button.set(substitute ? 'blink' : selected ? 'on' : 'off');
        });
        grid.appendChild(button.el);
      }
      row.append(busLabel, grid);
      body(row);
    }

    const programRow = document.createElement('div');
    programRow.className = 'mx-row mx-sep';
    const programLabel = document.createElement('span');
    programLabel.className = 'mx-note';
    programLabel.style.width = '60px';
    programLabel.textContent = 'Program out';
    const programGrid = this.grid(3);
    programGrid.style.flex = '1';
    const programChoices: { label: string; value: ProgramOut }[] = [
      { label: 'A', value: 'A' }, { label: 'B', value: 'B' }, { label: 'Effect', value: 'effect' },
    ];
    for (const choice of programChoices) {
      const button = ledButton({
        label: choice.label, tone: 'red',
        onClick: () => store.dispatch({ type: 'SET_PROGRAM_OUT', mode: choice.value }),
      });
      this.refresh.push((s) => button.set(s.programOut === choice.value ? 'on' : 'off'));
      programGrid.appendChild(button.el);
    }
    programRow.append(programLabel, programGrid);
    body(programRow);

    this.refresh.push((s) => {
      const direct = s.programOut === 'A' || s.programOut === 'B';
      const busState = s.programOut === 'A' ? s.busA : s.busB;
      note.textContent =
        direct && busState.source === 'matte'
          ? `Matte is never sent direct — source ${busState.substituteSource} substitutes on ${s.programOut}`
          : 'Direct A/B bypasses every effect stage';
    });
    body(note);
  }
}
