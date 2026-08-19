// The mixer context protocol (ADR-0017): the single coupling surface between the
// <mx-mixer> host and every connected component. A component resolves the context of
// "its" mixer through one helper — via the nearest host ancestor (a composed, bubbling
// request event in the shape of the Context Community Protocol), or via a `for="id"`
// reference when it is not a descendant. Imperative injection (bind()) stays outside
// this module and always wins over a later-arriving context.
//
// The context deliberately transports the ADR-0011 contract and nothing more: the
// store, the logical-clock reader, the preset file io, and a display-cadence frame
// hook. No renderer, no GPU device, no storage backends.

import type { PanelStore } from '../state/store.js';
import type { PanelState } from '../state/state.js';
import type { PresetFileIo } from '../persistence/file-io.js';

export type Unsubscribe = () => void;

export interface MixerContext {
  /** Dispatch + subscribe + getSnapshot — the one-way store (ADR-0011). */
  readonly store: PanelStore;
  /** The current logical tick (ADR-0012). */
  tick(): number;
  /** Preset save/load glue (ADR-0015); null when the host runs without storage. */
  readonly presetIo: PresetFileIo | null;
  /** Called after each rendered frame with the snapshot that was presented. */
  onFrame(fn: (state: PanelState, tick: number) => void): Unsubscribe;
}

/** Event name a host listens for. Answering hosts call stopPropagation, which is
 *  what scopes discovery to the NEAREST host when mixers nest. */
export const MIXER_CONTEXT_REQUEST = 'mx-context-request';

export class MixerContextRequest extends Event {
  constructor(readonly provide: (context: MixerContext) => void) {
    super(MIXER_CONTEXT_REQUEST, { bubbles: true, composed: true });
  }
}

/**
 * Resolve the mixer context for a component, from connectedCallback. `provide` may be
 * called asynchronously (the host queues requests that arrive before its GPU boot
 * finishes) or never (no host found) — components must stay inert until it fires.
 *
 * Resolution order: an explicit `for="id"` reference wins; otherwise the request
 * bubbles to the nearest <mx-mixer> ancestor.
 */
export function requestMixerContext(el: Element, provide: (context: MixerContext) => void): void {
  const forId = el.getAttribute('for');
  if (forId) {
    const host = el.ownerDocument.getElementById(forId);
    if (!host) return;
    // The referenced element may not be upgraded yet (its define() can run after this
    // component's). A custom-element host is addressed after its definition lands;
    // anything else is addressed directly and simply won't answer.
    if (host.localName.indexOf('-') >= 0) {
      void customElements.whenDefined(host.localName).then(() => {
        host.dispatchEvent(new MixerContextRequest(provide));
      });
    } else {
      host.dispatchEvent(new MixerContextRequest(provide));
    }
    return;
  }
  el.dispatchEvent(new MixerContextRequest(provide));
}
