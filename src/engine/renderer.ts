// The two-bus GPU renderer (ADR-0004 signal flow). Each frame it reads a panel snapshot
// and drives: resolve A/B sources (mixWipe context, so Matte is allowed) → per-bus
// pass-through stages → Mix/NAM combine → downstream pass-through → present. Program Out
// A/B short-circuit to the raw direct-out bus, bypassing every stage (reference §2).
//
// It reads the store snapshot but never calls into the UI (ADR-0011/0012).

import { createPerBusGraph, createDownstreamGraph } from '../core/signal-graph.js';
import { resolveBusSource } from '../core/resolve.js';
import { compositeRule } from '../core/transition.js';
import { directOutSource } from '../core/program.js';
import { CombinePass } from '../gpu/combine.js';
import { PresentPass } from '../gpu/present.js';
import type { SignalGraph } from '../core/signal-graph.js';
import type { Size } from '../core/types.js';
import type { GpuContext } from '../gpu/device.js';
import type { SourceRegistry } from '../sources/registry.js';
import type { GeneratedSource } from '../sources/generated-source.js';
import type { MatteSource } from '../sources/matte-source.js';
import type { PanelState } from '../state/state.js';

export interface RendererDeps {
  gpu: GpuContext;
  registry: SourceRegistry;
  /** Generated sources whose animation phase the renderer advances each frame. */
  generated: readonly GeneratedSource[];
  /** The Matte source, fed the current MatteState each frame. */
  matte: MatteSource;
  size: Size;
}

export class Renderer {
  private readonly perBusA: SignalGraph<GPUTexture>;
  private readonly perBusB: SignalGraph<GPUTexture>;
  private readonly downstream: SignalGraph<GPUTexture>;
  private readonly combine: CombinePass;
  private readonly present: PresentPass;

  constructor(private readonly deps: RendererDeps) {
    this.perBusA = createPerBusGraph<GPUTexture>();
    this.perBusB = createPerBusGraph<GPUTexture>();
    this.downstream = createDownstreamGraph<GPUTexture>();
    this.combine = new CombinePass(deps.gpu.device, deps.size);
    this.present = new PresentPass(deps.gpu.device, deps.gpu.srgbView);
  }

  render(state: PanelState, tick: number): void {
    const { gpu, registry, generated, matte } = this.deps;
    const device = gpu.device;

    for (const source of generated) source.phase = tick;
    matte.setMatte(state.matte);

    // Program Out A/B: raw direct-out bus, every stage bypassed (reference §2).
    if (state.programOut === 'A' || state.programOut === 'B') {
      const directId = directOutSource(state, state.programOut);
      const tex = registry.get(directId).getFrameTexture(device);
      this.present.render(gpu.context, tex, gpu.srgbView);
      return;
    }

    // EFFECT: full composite through the signal graph.
    const aTex = this.perBusA.run(registry.get(resolveBusSource(state.busA, 'mixWipe')).getFrameTexture(device));
    const bTex = this.perBusB.run(registry.get(resolveBusSource(state.busB, 'mixWipe')).getFrameTexture(device));
    const composite = this.combine.render(aTex, bTex, compositeRule(state.transition.type), state.transition.lever);
    const out = this.downstream.run(composite);
    this.present.render(gpu.context, out, gpu.srgbView);
  }
}
