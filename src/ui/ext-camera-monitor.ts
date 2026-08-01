// The EXT. CAMERA monitor card (reference §10, ADR-0008): the dedicated DSK key input on
// the source wall, mirroring the demo-feeds monitor chrome. Display-only + outward
// events (ADR-0011 one-way): it never reads the store or calls getUserMedia itself — the
// "Attach camera…" click emits 'mx-ext-attach' and main.ts drives the CameraSource.
// Browser-only, CI-excluded.

import { ensureTheme } from './theme.js';
import type { CameraLifecycle } from '../sources/camera-lifecycle.js';
import type { VideoInputInfo } from '../sources/device-list.js';
import type { TallyState } from './demo-feeds.js';

const PHASE_LABEL: Record<CameraLifecycle['phase'], string> = {
  unbound: 'OFF',
  requesting: 'PROMPT',
  live: 'LIVE',
  denied: 'DENIED',
  lost: 'LOST',
};

export class MxExtCameraMonitor extends HTMLElement {
  private readonly videoEl: HTMLVideoElement;
  private label: HTMLElement | null = null;
  private tally: HTMLElement | null = null;
  private select: HTMLSelectElement | null = null;
  private detachBtn: HTMLButtonElement | null = null;
  private phase: CameraLifecycle = { phase: 'unbound', deviceId: null };

  /** The element the CameraSource copies from — owned here, shown on the wall. */
  get video(): HTMLVideoElement {
    return this.videoEl;
  }

  constructor() {
    super();
    this.videoEl = document.createElement('video');
    this.videoEl.muted = true;
    this.videoEl.autoplay = true;
    this.videoEl.playsInline = true;
  }

  connectedCallback(): void {
    ensureTheme();
    const panel = document.createElement('div');
    panel.className = 'mx-srcmon';

    const monitor = document.createElement('div');
    monitor.className = 'mx-monitor';
    const scan = document.createElement('div');
    scan.className = 'scan';
    const label = document.createElement('div');
    label.className = 'mon-label';
    const tally = document.createElement('span');
    tally.className = 'mx-tally';
    tally.setAttribute('data-state', 'off');
    tally.title = 'Tally: red = keying on the DSK, green = EXT. CAMERA selected';
    monitor.append(this.videoEl, scan, label, tally);
    this.label = label;
    this.tally = tally;

    const caption = document.createElement('div');
    caption.className = 'mon-caption';
    const name = document.createElement('span');
    name.className = 'mx-note';
    name.textContent = 'External camera (DSK key)';

    const attach = document.createElement('button');
    attach.type = 'button';
    attach.className = 'mx-ghostbtn';
    attach.textContent = 'Attach camera…';
    attach.addEventListener('click', () => {
      const detail = this.select && !this.select.hidden ? this.select.value || undefined : undefined;
      this.dispatchEvent(new CustomEvent<string | undefined>('mx-ext-attach', { detail, bubbles: true }));
    });

    const detach = document.createElement('button');
    detach.type = 'button';
    detach.className = 'mx-ghostbtn';
    detach.textContent = 'Detach';
    detach.hidden = true;
    detach.addEventListener('click', () => this.dispatchEvent(new CustomEvent('mx-ext-detach', { bubbles: true })));
    this.detachBtn = detach;

    const select = document.createElement('select');
    select.className = 'mx-ghostbtn';
    select.hidden = true;
    select.title = 'Camera device';
    select.addEventListener('change', () => {
      this.dispatchEvent(new CustomEvent<string | undefined>('mx-ext-attach', { detail: select.value || undefined, bubbles: true }));
    });
    this.select = select;

    caption.append(name, attach, detach, select);
    panel.append(monitor, caption);
    this.appendChild(panel);
    this.reflect();
  }

  /** Display-only lifecycle reflection. */
  setPhase(s: CameraLifecycle): void {
    this.phase = s;
    this.reflect();
  }

  /** Repopulate the device chooser (post-grant labels; on devicechange). */
  setDevices(devices: readonly VideoInputInfo[]): void {
    if (!this.select) return;
    this.select.innerHTML = '';
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.label || 'Camera';
      this.select.appendChild(opt);
    }
    this.select.hidden = devices.length === 0;
  }

  setTally(state: TallyState): void {
    this.tally?.setAttribute('data-state', state);
  }

  private reflect(): void {
    if (this.label) this.label.textContent = `EXT. CAMERA · ${PHASE_LABEL[this.phase.phase]}`;
    if (this.detachBtn) this.detachBtn.hidden = this.phase.phase !== 'live';
  }
}

let defined = false;

export function createExtCameraMonitor(): MxExtCameraMonitor {
  if (!defined) {
    customElements.define('mx-ext-camera-monitor', MxExtCameraMonitor);
    defined = true;
  }
  return document.createElement('mx-ext-camera-monitor') as MxExtCameraMonitor;
}
