// Explain mode for the operator console: a header toggle that outlines every block and,
// while on, shows what the hovered (or focused) block is — its summary, the manual
// section it implements, and the feature file that pins it — in a caption bar pinned to
// the bottom of the viewport. Read-only chrome over BLOCK_REFERENCE; it never touches
// the store (ADR-0011) and costs nothing while off.

import { BLOCK_REFERENCE, referenceLine } from './blocks/reference.js';

const REPO_FEATURES = 'https://github.com/sebs/webgpu-mx-50/blob/main/features/';

const STYLE = `
.mx-ghostbtn[aria-pressed="true"] { color: var(--mx-amber); border-color: color-mix(in srgb, var(--mx-amber) 50%, var(--mx-line)); }
mx-console[data-explain="on"] .mx-block { outline: 1px dashed color-mix(in srgb, var(--mx-amber) 55%, transparent); outline-offset: 2px; }
mx-console[data-explain="on"] .mx-block[data-explained] { outline: 2px solid var(--mx-amber); }
.mx-explain-bar { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 40;
  width: min(760px, calc(100vw - 32px)); padding: 12px 16px; border-radius: 8px;
  background: linear-gradient(180deg, var(--mx-panel-hi), var(--mx-panel-lo)); border: 1px solid var(--mx-line);
  box-shadow: 0 12px 34px rgba(0,0,0,0.6); color: var(--mx-text); font: 13px/1.5 var(--mx-font); }
.mx-explain-bar[hidden] { display: none; }
.mx-explain-bar .ref { margin-top: 6px; font: 500 9px/1.4 var(--mx-font); letter-spacing: 0.12em; text-transform: uppercase; color: var(--mx-label); }
.mx-explain-bar a { color: var(--mx-amber); }
`;

/** Wire the toggle button to `consoleEl`; returns the button for the caller to place. */
export function createExplainToggle(consoleEl: HTMLElement): HTMLButtonElement {
  if (!document.getElementById('mx-explain-style')) {
    const style = document.createElement('style');
    style.id = 'mx-explain-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  const bar = document.createElement('div');
  bar.className = 'mx-explain-bar';
  bar.setAttribute('role', 'status');
  bar.hidden = true;
  document.body.appendChild(bar);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mx-ghostbtn';
  button.textContent = 'Explain';
  button.title = 'Explain mode: hover or focus a block to see what it is and which spec pins it';
  button.setAttribute('aria-pressed', 'false');

  let current: HTMLElement | null = null;
  const show = (block: HTMLElement | null): void => {
    if (block === current) return;
    current?.removeAttribute('data-explained');
    current = block;
    const ref = block ? BLOCK_REFERENCE[block.localName] : undefined;
    if (!block || !ref) {
      bar.hidden = true;
      return;
    }
    block.setAttribute('data-explained', '');
    bar.innerHTML = '';
    const title = document.createElement('strong');
    title.textContent = ref.title;
    const summary = document.createElement('span');
    summary.textContent = ' — ' + ref.summary;
    const line = document.createElement('div');
    line.className = 'ref';
    const link = document.createElement('a');
    link.href = REPO_FEATURES + ref.feature;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'read the spec';
    line.append(referenceLine(ref) + ' · ', link);
    bar.append(title, summary, line);
    bar.hidden = false;
  };

  const blockOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element ? (target.closest('.mx-block') as HTMLElement | null) : null;
  const onPointer = (e: Event): void => show(blockOf(e.target));
  const onFocus = (e: Event): void => show(blockOf(e.target));

  button.addEventListener('click', () => {
    const on = consoleEl.getAttribute('data-explain') !== 'on';
    consoleEl.setAttribute('data-explain', on ? 'on' : 'off');
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) {
      consoleEl.addEventListener('pointerover', onPointer);
      consoleEl.addEventListener('focusin', onFocus);
    } else {
      consoleEl.removeEventListener('pointerover', onPointer);
      consoleEl.removeEventListener('focusin', onFocus);
      show(null);
    }
  });
  return button;
}
