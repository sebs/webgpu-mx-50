// Shared control-surface parts for the hardware blocks (ADR-0013/0017): the LED-state
// button primitive every block composes, and the tiny formatting helpers. Pure DOM +
// callbacks — no store access; the blocks wire clicks to ADR-0011 commands.

export type LedState = 'off' | 'on' | 'blink' | 'blinkfast';
export type LedTone = 'amber' | 'red' | 'green';

export interface LedButton {
  el: HTMLButtonElement;
  set(state: LedState): void;
  setTone(tone: LedTone): void;
  setLabel(text: string): void;
}

export interface LedButtonOptions {
  label: string;
  tone?: LedTone;
  shape?: 'dot' | 'bar' | 'minibar';
  stack?: boolean;
  wide?: boolean;
  title?: string;
  mono?: boolean;
  onClick: () => void;
}

export function ledButton(options: LedButtonOptions): LedButton {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'mxled' + (options.stack ? ' stack' : '') + (options.wide ? ' mx-wide' : '');
  el.setAttribute('data-tone', options.tone ?? 'amber');
  el.setAttribute('data-state', 'off');
  el.setAttribute('aria-pressed', 'false');
  if (options.title) el.title = options.title;
  const led = document.createElement('span');
  led.className = 'led';
  led.setAttribute('data-shape', options.shape ?? 'dot');
  const text = document.createElement('span');
  text.textContent = options.label;
  if (options.mono) text.style.font = '500 9px/1 var(--mx-mono)';
  el.append(led, text);
  el.addEventListener('click', options.onClick);
  return {
    el,
    set: (state) => {
      el.setAttribute('data-state', state);
      el.setAttribute('aria-pressed', String(state !== 'off'));
    },
    setTone: (tone) => el.setAttribute('data-tone', tone),
    setLabel: (t) => (text.textContent = t),
  };
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
