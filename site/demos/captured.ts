// The no-WebGPU fallback media: committed captures from the real renderer
// (scripts/capture-posters.mjs, listed in site/posters.ts). Kept apart from live.ts on
// purpose: live.ts imports the mixer host and every block, and a page that only needs a
// fallback (the wipe wall) must not load that module graph — there is no bundler to
// shake it out (ADR-0003).

import { siteRoot } from '../shell.js';
import { LOOPS } from '../posters.js';
import { reducedMotion } from './base.js';

function chip(text: string): HTMLElement {
  const c = document.createElement('span');
  c.className = 'mx-chip';
  c.textContent = text;
  return c;
}

/**
 * The fallback media for a captured id, ready to append: a muted looping recording with the
 * still as its poster (a browser that cannot play WebM shows the still), or the still alone.
 *
 * Same budget rule as the live benches: a recording downloads nothing until it is first on
 * screen (preload="none", no autoplay), and plays only while it is on screen.
 */
export function capturedMedia(id: string, what: string): DocumentFragment {
  const out = document.createDocumentFragment();
  const still = new URL(`site/posters/${id}.jpg`, siteRoot()).href;
  if (LOOPS.indexOf(id) !== -1 && !reducedMotion()) {
    const video = document.createElement('video');
    video.src = new URL(`site/posters/${id}.webm`, siteRoot()).href;
    video.poster = still;
    video.preload = 'none';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('aria-label', `A recording of ${what}, captured from the real renderer`);
    new IntersectionObserver((entries) => {
      if (entries[entries.length - 1]!.isIntersecting) void video.play().catch(() => undefined);
      else video.pause();
    }).observe(video);
    out.append(video, chip('recorded · needs WebGPU to run live'));
    return out;
  }
  const img = document.createElement('img');
  img.src = still;
  img.alt = `A still of ${what}, captured from the real renderer`;
  img.loading = 'lazy';
  out.append(img, chip('still image · needs WebGPU to run'));
  return out;
}
