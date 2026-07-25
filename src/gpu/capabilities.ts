// WebGPU feature detection and the graceful no-WebGPU message (ADR-0002). There is no
// WebGL2 fallback in v1; if WebGPU is absent the app shows a clear message naming the
// requirement rather than crashing.

export interface CapabilityResult {
  ok: boolean;
  reason?: string;
}

/** True only when `navigator.gpu` exists. Accepts an injected navigator for testing. */
export function detectWebGPU(nav: Navigator = navigator): CapabilityResult {
  if (!nav || !('gpu' in nav) || !nav.gpu) {
    return { ok: false, reason: 'This browser does not expose navigator.gpu (WebGPU).' };
  }
  return { ok: true };
}

export const WEBGPU_REQUIREMENT_MESSAGE =
  'web-mx-50 needs WebGPU. Use a recent Chromium-based browser (Chrome/Edge 113+), ' +
  'Safari 18+, or Firefox with WebGPU enabled, over HTTPS or localhost.';
