// Golden-image / SSIM harness scaffolding (ADR-0016). Real shader goldens render a
// pass to an offscreen target through a HEADLESS WebGPU adapter (Dawn via node-webgpu,
// or Deno's built-in WebGPU) and compare against a committed reference PNG with an
// SSIM threshold. Where no adapter is available — the common CI case, and this Node
// process — the suite SKIPS rather than fails, so the fast domain-test layer stays the
// required gate and pixel coverage degrades gracefully (Phase 0 Definition of Done).

import { test } from 'node:test';

const gpu = (globalThis.navigator as Navigator | undefined)?.gpu;
const skip = gpu === undefined ? 'no WebGPU adapter in this environment' : false;

test('present pass matches its golden image (SSIM)', { skip }, () => {
  // TODO(golden): with a headless adapter, render present.wgsl over a known input to
  // an offscreen rgba texture, read it back, and assert SSIM >= threshold vs. a
  // committed reference PNG (regenerated only via an explicit --update-goldens gate).
});

test('test-pattern generated source matches its golden image (SSIM)', { skip }, () => {
  // TODO(golden): render test-pattern.wgsl at a fixed phase and compare to a reference.
});
