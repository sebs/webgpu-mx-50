// The MIDI setup panel (ADR-0018): profile switching (Defaults / the published Ableton
// profile), the MPE lower-zone toggle, and MIDI learn for the curated target list. This is
// page-level chrome, not a connected block: the ADR-0014 adapters are owned by the
// composition root (main.ts), so the panel is attached imperatively with the binding table
// and the MIDI adapter — it never touches the store or the mixer context.
//
// Learn flow: arm a target → the adapter's one-shot capture classifies the next touched
// input (14-bit pair / relative encoder / note / PC) → learnedBinding() builds the Binding →
// BindingTable.rebind() persists it through the ADR-0015 onChange hook. Unlearn = unbind.

import { ensureTheme } from './theme.js';
import { ledButton } from './blocks/parts.js';
import { ABLETON_PROFILE, DEFAULT_BINDINGS } from '../control/bindings.js';
import { LEARN_TARGETS, learnedBinding } from '../control/learnable.js';
import type { BindingTable } from '../control/bindings.js';
import type { MidiAdapter } from '../control/midi.js';
import type { LearnTarget } from '../control/learnable.js';
import type { LedButton } from './blocks/parts.js';

/** All MIDI/MPE addresses currently bound to a target (reverse lookup, first two shown). */
function addressesFor(bindings: BindingTable, target: LearnTarget): string[] {
  const map = bindings.toJSON();
  const out: string[] = [];
  for (const address in map) {
    if (address.indexOf('midi:') !== 0 && address.indexOf('mpe:') !== 0) continue;
    const b = map[address]!;
    if (b.control !== target.control) continue;
    if (target.value !== undefined && b.value !== target.value) continue;
    out.push(address);
  }
  return out;
}

export class MxMidiPanel extends HTMLElement {
  private bindings: BindingTable | null = null;
  private midi: MidiAdapter | null = null;
  private readonly badgeRefresh: Array<() => void> = [];
  private armedLed: LedButton | null = null;

  /** Wire the page-owned control layer in; builds (or rebuilds) the panel. */
  attach(bindings: BindingTable, midi: MidiAdapter): void {
    this.bindings = bindings;
    this.midi = midi;
    this.build();
  }

  disconnectedCallback(): void {
    this.midi?.cancelLearn();
  }

  private refreshBadges(): void {
    for (const fn of this.badgeRefresh) fn();
  }

  private disarm(): void {
    this.midi?.cancelLearn();
    this.armedLed?.set('off');
    this.armedLed = null;
  }

  private build(): void {
    const bindings = this.bindings;
    const midi = this.midi;
    if (!bindings || !midi) return;
    ensureTheme();
    this.textContent = '';
    this.badgeRefresh.length = 0;
    this.style.display = 'block';
    this.style.marginTop = '12px';

    const details = document.createElement('details');
    details.className = 'mx-block';
    const summary = document.createElement('summary');
    summary.style.cssText = 'cursor:pointer;list-style:none';
    const head = document.createElement('div');
    head.className = 'mx-block-head';
    const title = document.createElement('span');
    title.textContent = 'MIDI · profiles & learn';
    const chip = document.createElement('span');
    chip.className = 'mx-block-id';
    chip.textContent = 'ADR-0018';
    head.append(title, chip);
    summary.appendChild(head);
    details.appendChild(summary);

    // Profile + MPE row.
    const row = document.createElement('div');
    row.className = 'mx-row';
    const defaults = ledButton({
      label: 'Defaults', title: 'Restore the ships-with binding map',
      onClick: () => {
        this.disarm();
        bindings.replace(DEFAULT_BINDINGS);
        this.refreshBadges();
      },
    });
    const ableton = ledButton({
      label: 'Ableton profile', title: 'The published DAW map: CC1/CC2 14-bit levers, notes 60+, PC 0–7 recall',
      onClick: () => {
        this.disarm();
        bindings.replace(ABLETON_PROFILE);
        this.refreshBadges();
      },
    });
    const mpe = ledButton({
      label: 'MPE zone', title: 'MPE lower zone: each held note is a bend/slide/pressure gesture voice (mpe:pad/… addresses)',
      onClick: () => {
        midi.setMpe(!midi.mpeEnabled);
        mpe.set(midi.mpeEnabled ? 'on' : 'off');
      },
    });
    mpe.set(midi.mpeEnabled ? 'on' : 'off');
    const note = document.createElement('span');
    note.className = 'mx-note';
    note.textContent = 'Learn: arm a control, touch your controller — 14-bit pairs and relative encoders are detected.';
    row.append(defaults.el, ableton.el, mpe.el, note);
    details.appendChild(row);

    // Learn grid.
    const grid = document.createElement('div');
    grid.className = 'mx-grid tight';
    grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    for (const target of LEARN_TARGETS) {
      const line = document.createElement('div');
      line.className = 'mx-row';
      const label = document.createElement('span');
      label.className = 'mx-note';
      label.style.cssText = 'width:130px;flex:none';
      label.textContent = target.label;
      const badge = document.createElement('span');
      badge.className = 'mx-note';
      badge.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--mx-mono)';
      const refresh = (): void => {
        const bound = addressesFor(bindings, target);
        badge.textContent = bound.length ? bound.join(' ') : '—';
        badge.title = bound.join('\n');
      };
      this.badgeRefresh.push(refresh);
      refresh();

      const learn = ledButton({
        label: 'Learn', shape: 'minibar',
        title: 'Arm, then touch the controller input to bind',
        onClick: () => {
          if (this.armedLed === learn) {
            this.disarm();
            return;
          }
          this.disarm();
          this.armedLed = learn;
          learn.set('blink');
          midi.learn((learned) => {
            bindings.rebind(learned.address, learnedBinding(target, learned));
            this.armedLed = null;
            learn.set('off');
            this.refreshBadges();
          });
        },
      });
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'mx-ghostbtn';
      clear.textContent = '×';
      clear.title = 'Unbind this control from MIDI';
      clear.addEventListener('click', () => {
        this.disarm();
        for (const address of addressesFor(bindings, target)) bindings.unbind(address);
        this.refreshBadges();
      });
      line.append(label, badge, learn.el, clear);
      grid.appendChild(line);
    }
    details.appendChild(grid);
    this.appendChild(details);
  }
}

let defined = false;

/** Define the element (once) and return an attached instance. */
export function createMidiPanel(bindings: BindingTable, midi: MidiAdapter): MxMidiPanel {
  if (!defined) {
    customElements.define('mx-midi-panel', MxMidiPanel);
    defined = true;
  }
  const panel = document.createElement('mx-midi-panel') as MxMidiPanel;
  panel.attach(bindings, midi);
  return panel;
}
