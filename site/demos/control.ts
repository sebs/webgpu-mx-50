// D16 — control mapping (ADR-0014) and D21 — the device catalog (inputs-and-devices).
//
// D16 is the whole input layer on one screen: a physical address becomes a binding, a
// binding becomes a normalised ControlSignal, the resolver turns that into exactly one
// store Command, and the reducer applies it. Keyboard, gamepad, MIDI and the GPI contact
// all converge on the same vocabulary — which is the point of the abstraction.

import { PanelStore } from '../../src/state/store.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import { BindingTable, DEFAULT_BINDINGS } from '../../src/control/bindings.js';
import { keyChord, chordToSignal, isTyping } from '../../src/control/keyboard.js';
import { resolveSignal } from '../../src/control/resolver.js';
import { MediaDeviceCatalog } from '../../src/sources/device-catalog.js';
import type { CatalogDevice, CatalogKind } from '../../src/sources/device-catalog.js';
import { DemoElement, defineDemo, caption, button } from './base.js';
import { esc } from '../shell.js';

// ------------------------------------------------------------------ D16

class ControlMapping extends DemoElement {
  protected render(): void {
    const store = new PanelStore(FACTORY_PRESET);
    const table = new BindingTable();
    let tick = 0;

    const trace = document.createElement('div');
    trace.style.minHeight = '190px';

    const armed = document.createElement('div');
    armed.className = 'mx-row';
    armed.style.marginBottom = '12px';

    let listening = false;
    const listenBtn = button('Click here, then press a key', () => {
      listening = !listening;
      listenBtn.classList.toggle('on', listening);
      listenBtn.textContent = listening ? 'Listening — press a key' : 'Click here, then press a key';
    });
    armed.appendChild(listenBtn);

    const simulate = (address: string, label: string): HTMLButtonElement =>
      button(label, () => {
        const binding = table.get(address);
        if (!binding) {
          show(address, null, null, null);
          return;
        }
        const signal = { control: binding.control, mode: binding.mode, value: binding.value };
        tick += 1;
        const command = resolveSignal(signal, store.getSnapshot(), tick);
        if (command) store.dispatch(command);
        show(address, JSON.stringify(binding), JSON.stringify(signal), command ? JSON.stringify(command) : null);
      });

    const sims = document.createElement('div');
    sims.className = 'mx-row';
    sims.style.marginBottom = '12px';
    sims.appendChild(simulate('serial:gpi', 'GPI contact pulse'));
    sims.appendChild(simulate('gamepad:button/0', 'Gamepad button 0'));
    sims.appendChild(simulate('midi:note/0/60', 'MIDI note 60'));
    sims.appendChild(simulate('key:Digit2', 'Key “2”'));

    const show = (address: string, binding: string | null, signal: string | null, command: string | null): void => {
      const s = store.getSnapshot();
      trace.innerHTML =
        step('1 · Physical address', `<code>${esc(address)}</code>`, true) +
        step('2 · Binding (data, not code)', binding ? `<code>${esc(binding)}</code>` : '<span class="mx-dim">unbound — nothing happens</span>', binding !== null) +
        step('3 · Normalised ControlSignal', signal ? `<code>${esc(signal)}</code>` : '—', signal !== null) +
        step('4 · Resolved Command', command ? `<code>${esc(command)}</code>` : '<span class="mx-dim">no command — the resolver declined (state made it a no-op)</span>', command !== null) +
        step(
          '5 · Store',
          `bus A → <strong>${String(s.busA.source)}</strong> · lever <strong>${s.transition.lever.toFixed(2)}</strong> · ` +
            `program out <strong>${s.programOut}</strong> · transition <strong>${s.transition.type}</strong>`,
          true,
        );
    };

    const onKey = (e: KeyboardEvent): void => {
      if (!listening) return;
      if (isTyping(document.activeElement as { tagName?: string; isContentEditable?: boolean } | null)) return;
      const chord = keyChord(e);
      const signal = chordToSignal(chord, table);
      if (!signal) {
        show(chord, null, null, null);
        return;
      }
      e.preventDefault();
      tick += 1;
      const command = resolveSignal(signal, store.getSnapshot(), tick);
      if (command) store.dispatch(command);
      show(chord, JSON.stringify(table.get(chord)), JSON.stringify(signal), command ? JSON.stringify(command) : null);
    };
    window.addEventListener('keydown', onKey);
    this.onDispose(() => window.removeEventListener('keydown', onKey));

    const bindingList = document.createElement('div');
    bindingList.className = 'mx-tablewrap';
    bindingList.style.marginTop = '14px';
    const rows: string[] = [];
    const addresses = Object.keys(DEFAULT_BINDINGS);
    for (let i = 0; i < addresses.length; i++) {
      const a = addresses[i]!;
      const b = DEFAULT_BINDINGS[a]!;
      rows.push(
        `<tr><td><code>${esc(a)}</code></td><td><code>${esc(b.control)}</code></td><td>${esc(b.mode)}</td>` +
          `<td class="mx-dim">${b.value !== undefined ? esc(String(b.value)) : b.range ? `${b.range.lo}…${b.range.hi}` : '—'}</td></tr>`,
      );
    }
    bindingList.innerHTML =
      `<table class="mx-table"><thead><tr><th>Address</th><th>Logical control</th><th>Mode</th><th>Value / range</th></tr></thead>` +
      `<tbody>${rows.join('')}</tbody></table>`;

    this.appendChild(armed);
    this.appendChild(sims);
    this.appendChild(trace);
    this.appendChild(bindingList);
    this.appendChild(
      caption(
        'The chain is <code>keyChord</code> → <code>BindingTable</code> → <code>ControlSignal</code> → ' +
          '<code>resolveSignal</code> → one <code>Command</code>. Note step 4: the resolver is allowed to decline, ' +
          'which is how a control that would be a no-op in the current state produces nothing at all.',
      ),
    );
    show('—', null, null, null);
  }
}

function step(label: string, value: string, active: boolean): string {
  return `<div style="display:flex;gap:14px;padding:8px 0;border-bottom:1px solid var(--mx-line);opacity:${active ? 1 : 0.5}">
    <span class="mx-label" style="min-width:14rem">${label}</span><span style="min-width:0;word-break:break-word">${value}</span></div>`;
}

// ------------------------------------------------------------------ D21

const FAKE_CAMS: CatalogDevice[] = [
  { deviceId: 'cam-a', label: 'FaceTime HD Camera', kind: 'videoinput' },
  { deviceId: 'cam-b', label: 'USB Capture HDMI', kind: 'videoinput' },
];
const FAKE_MICS: CatalogDevice[] = [
  { deviceId: 'mic-a', label: 'MacBook Pro Microphone', kind: 'audioinput' },
  { deviceId: 'mic-b', label: 'Scarlett 2i2', kind: 'audioinput' },
];

/**
 * The permission-gated enumeration model, headless. Before a grant, a chooser sees NO
 * devices and no labels — which is exactly what the browser does, and is modelled here so
 * the rule can be tested without a camera.
 */
class DeviceCatalogDemo extends DemoElement {
  protected render(): void {
    const catalog = new MediaDeviceCatalog();
    const out = document.createElement('div');

    const controls = document.createElement('div');
    controls.className = 'mx-row';
    controls.style.marginBottom = '12px';
    controls.appendChild(button('Grant camera', () => { catalog.grant('videoinput', FAKE_CAMS); paint(); }));
    controls.appendChild(button('Deny camera', () => { catalog.deny('videoinput'); paint(); }));
    controls.appendChild(button('Grant mic', () => { catalog.grant('audioinput', FAKE_MICS); paint(); }));
    controls.appendChild(
      button('Unplug the capture card', () => {
        const remaining: CatalogDevice[] = [FAKE_CAMS[0]!];
        for (let i = 0; i < FAKE_MICS.length; i++) remaining.push(FAKE_MICS[i]!);
        catalog.refresh(remaining);
        paint();
      }),
    );

    const paint = (): void => {
      const kinds: CatalogKind[] = ['videoinput', 'audioinput'];
      const blocks: string[] = [];
      for (let k = 0; k < kinds.length; k++) {
        const kind = kinds[k]!;
        const perm = catalog.permission(kind);
        const devices = catalog.devices(kind);
        const items: string[] = [];
        for (let i = 0; i < devices.length; i++) items.push(`<li><code>${esc(devices[i]!.label)}</code></li>`);
        blocks.push(
          `<div style="padding:10px 0;border-bottom:1px solid var(--mx-line)">
            <div class="mx-row" style="gap:10px">
              <span class="mx-label" style="min-width:8rem">${kind}</span>
              <span class="mx-chip ${perm === 'granted' ? 'ok' : perm === 'denied' ? 'live' : ''}">
                <span class="led"></span>${perm}</span>
              <span class="mx-dim">${catalog.requiresPrompt(kind) ? 'choosing must prompt first' : 'no prompt needed'}</span>
            </div>
            ${items.length ? `<ul style="margin:8px 0 0 18px">${items.join('')}</ul>` : '<p class="mx-dim" style="margin:8px 0 0">No devices visible — labels stay hidden until permission is granted.</p>'}
          </div>`,
        );
      }
      out.innerHTML = blocks.join('');
    };

    this.appendChild(controls);
    this.appendChild(out);
    this.appendChild(
      caption(
        'A real <code>MediaDeviceCatalog</code> (<code>src/sources/device-catalog.ts</code>) driven by fake ' +
          'enumeration results. Modelling permission this way is why nine device scenarios can run in CI with no ' +
          'camera attached. Grant the camera, then unplug the capture card to see a <code>devicechange</code>.',
      ),
    );
    paint();
  }
}

defineDemo('mx-demo-control-map', ControlMapping);
defineDemo('mx-demo-devices', DeviceCatalogDemo);
