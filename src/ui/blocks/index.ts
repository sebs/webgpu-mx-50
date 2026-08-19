// The connected hardware blocks (ADR-0013 blocks × ADR-0017 connection): one custom
// element per reference section, each usable inside <mx-console>, as a standalone
// descendant of <mx-mixer>, via `for="id"`, or bound imperatively.

import { MxSourceBlock } from './source.js';
import { MxMatteBlock } from './matte.js';
import { MxColourCorrectionBlock } from './colour-correction.js';
import { MxPositionBlock } from './position.js';
import { MxMixWipeBlock } from './mixwipe.js';
import { MxDigitalEffectBlock } from './digital-effect.js';
import { MxFreezeBlock } from './freeze.js';
import { MxAudioBlock } from './audio.js';
import { MxDskBlock } from './dsk.js';
import { MxFadeBlock } from './fade.js';
import { MxMemoryBlock } from './memory.js';

export { MxBlock } from './base.js';
export {
  MxSourceBlock, MxMatteBlock, MxColourCorrectionBlock, MxPositionBlock, MxMixWipeBlock,
  MxDigitalEffectBlock, MxFreezeBlock, MxAudioBlock, MxDskBlock, MxFadeBlock, MxMemoryBlock,
};

const REGISTRY: { tag: string; ctor: CustomElementConstructor }[] = [
  { tag: 'mx-source-block', ctor: MxSourceBlock },
  { tag: 'mx-matte-block', ctor: MxMatteBlock },
  { tag: 'mx-colour-correction-block', ctor: MxColourCorrectionBlock },
  { tag: 'mx-position-block', ctor: MxPositionBlock },
  { tag: 'mx-mixwipe-block', ctor: MxMixWipeBlock },
  { tag: 'mx-digital-effect-block', ctor: MxDigitalEffectBlock },
  { tag: 'mx-freeze-block', ctor: MxFreezeBlock },
  { tag: 'mx-audio-block', ctor: MxAudioBlock },
  { tag: 'mx-dsk-block', ctor: MxDskBlock },
  { tag: 'mx-fade-block', ctor: MxFadeBlock },
  { tag: 'mx-memory-block', ctor: MxMemoryBlock },
];

/** Define every block element (idempotent); static markup upgrades at this call. */
export function defineBlocks(): void {
  for (const entry of REGISTRY) {
    if (!customElements.get(entry.tag)) customElements.define(entry.tag, entry.ctor);
  }
}
