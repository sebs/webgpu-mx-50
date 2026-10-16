// The no-WebGPU fallback media: committed captures from the real renderer
// (scripts/capture-posters.mjs, listed in site/posters.ts). Kept apart from live.ts on
// purpose: live.ts imports the mixer host and every block, and a page that only needs a
// fallback (the wipe wall) must not load that module graph — there is no bundler to
// shake it out (ADR-0003).

import { siteRoot } from '../shell.js';
import { LOOPS } from '../posters.js';
import { reducedMotion } from './base.js';

/**
 * The fallback media for a captured id: a muted looping recording with the still as its
 * poster (a browser that cannot play WebM shows the still), or the still alone.
 */
export function capturedMedia(id: string, what: string): string {
  const still = new URL(`site/posters/${id}.jpg`, siteRoot()).href;
  if (LOOPS.indexOf(id) !== -1 && !reducedMotion()) {
    const loop = new URL(`site/posters/${id}.webm`, siteRoot()).href;
    return (
      `<video src="${loop}" poster="${still}" autoplay muted loop playsinline aria-label="A recording of ${what}, captured from the real renderer"></video>` +
      `<span class="mx-chip">recorded · needs WebGPU to run live</span>`
    );
  }
  return (
    `<img src="${still}" alt="A still of ${what}, captured from the real renderer">` +
    `<span class="mx-chip">still image · needs WebGPU to run</span>`
  );
}
