// The two-bus GPU renderer (ADR-0004 signal flow). Each frame it reads a panel snapshot
// and drives: resolve A/B sources (mixWipe context, so Matte is allowed) → per-bus
// pass-through stages (with the A/V-Synchro pulsed set, reference §8.9) → Mix/NAM/Wipe
// combine — or a Special-Mode macro picture (reference §14) — → VIDEO-element fade →
// Downstream Key → present. Program Out A/B short-circuit to the raw direct-out bus,
// bypassing every stage (reference §2).
//
// The Fade stage is observationally still last (STAGE_ORDER untouched): the VIDEO element
// fades the pre-DSK composite and the DSK element is applied inside the DSK pass as
// key-mask opacity, which commutes with keying — that is what lets a VIDEO-only fade
// leave the title on screen and a DSK-only fade remove only the title (reference §11).
//
// It reads the store snapshot but never calls into the UI (ADR-0011/0012).

import { resolveBusSource } from '../core/resolve.js';
import { compositeRule } from '../core/transition.js';
import { directOutSource } from '../core/program.js';
import { dskKeyFeed } from '../core/dsk.js';
import { fadeVideoTarget, videoFadeAmount } from '../core/fade.js';
import { specialFrame } from '../core/special-mode-geometry.js';
import type { GrabCapture, StillPixels, StillRecord } from '../core/positioner.js';
import { BusProcessor, NO_PULSE } from '../gpu/bus-processor.js';
import { CombinePass } from '../gpu/combine.js';
import { WipePass } from '../gpu/wipe.js';
import { DskPass } from '../gpu/dsk.js';
import { FadePass } from '../gpu/fade.js';
import { PresentPass } from '../gpu/present.js';
import { SpecialFxPass } from '../gpu/special-fx.js';
import type { Size } from '../core/types.js';
import type { GpuContext } from '../gpu/device.js';
import type { SourceRegistry } from '../sources/registry.js';
import type { GeneratedSource } from '../sources/generated-source.js';
import type { MatteSource } from '../sources/matte-source.js';
import type { AvSynchroEffect, PanelState } from '../state/state.js';

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
  // The per-bus stages (Colour Correction + Digital Effect) are realised by BusProcessor.
  private readonly busProcA: BusProcessor;
  private readonly busProcB: BusProcessor;
  private readonly combine: CombinePass;
  private readonly wipe: WipePass;
  private readonly specialFx: SpecialFxPass;
  private readonly dsk: DskPass;
  private readonly fade: FadePass;
  private readonly present: PresentPass;

  constructor(private readonly deps: RendererDeps) {
    this.busProcA = new BusProcessor(deps.gpu.device, deps.size);
    this.busProcB = new BusProcessor(deps.gpu.device, deps.size);
    this.combine = new CombinePass(deps.gpu.device, deps.size);
    this.wipe = new WipePass(deps.gpu.device, deps.size);
    this.specialFx = new SpecialFxPass(deps.gpu.device, deps.size);
    this.dsk = new DskPass(deps.gpu.device, deps.size);
    this.fade = new FadePass(deps.gpu.device, deps.size);
    this.present = new PresentPass(deps.gpu.device, deps.gpu.srgbView);
  }

  /**
   * Render one frame. `avPulsed` is the transient per-frame A/V-Synchro set (ADR-0010) —
   * never stored, never dispatched; the render loop measures it and threads it here.
   */
  render(state: PanelState, tick: number, avPulsed: readonly AvSynchroEffect[] = NO_PULSE): void {
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
    const aSrc = registry.get(resolveBusSource(state.busA, 'mixWipe')).getFrameTexture(device);
    const bSrc = registry.get(resolveBusSource(state.busB, 'mixWipe')).getFrameTexture(device);
    const aTex = this.busProcA.render(aSrc, state, 'A', tick, avPulsed);
    const bTex = this.busProcB.render(bSrc, state, 'B', tick, avPulsed);

    // Scene Grabber (reference §7): track the grab edge every effect frame so the capture
    // fires the instant SCENE GRABBER is pressed, whatever the current transition type.
    this.wipe.trackGrab(bTex, state);

    // Combine stage: a Special-Mode macro picture (reference §14) replaces the normal
    // Mix/NAM/Wipe composite while one drives the picture.
    const sf = specialFrame(state, tick);
    const composite = sf
      ? this.specialFx.render(aTex, bTex, matte.getFrameTexture(device), sf)
      : state.transition.type === 'wipe'
        ? this.wipe.render(aTex, bTex, state)
        : this.combine.render(
            aTex,
            bTex,
            compositeRule(state.transition.type),
            state.transition.lever,
            state.transition.slice,
            state.transition.hue,
          );

    // Fade (reference §11), VIDEO element — realised before the key so the title can
    // survive a video-only fade. Fade-to-A/B binds the RAW (uneffected) source texture,
    // bypassing effects and Mix/Wipe.
    let base = composite;
    if (videoFadeAmount(state.fade) > 0) {
      const target = fadeVideoTarget(state);
      const targetTex =
        target.kind === 'bus'
          ? registry.get(target.source).getFrameTexture(device)
          : matte.getFrameTexture(device); // flat-colour path ignores the texture; matte is a valid bind
      base = this.fade.render(composite, targetTex, state);
    }

    // Downstream Key (reference §10) over the (possibly faded) picture; the DSK fade
    // element dissolves the title independently inside the pass. Key source is a bus
    // texture, the live External Camera, or — while no camera is granted/delivering —
    // the UNFADED composite stand-in (so the key window stays stable during a
    // video-only fade).
    let out = base;
    if (state.dsk.on) {
      const cam = registry.has('ext-camera') ? registry.get('ext-camera') : null;
      const feed = dskKeyFeed(state.dsk.keySource, cam !== null && cam.isReady);
      const keyTex =
        feed === 'A' ? aTex : feed === 'B' ? bTex : feed === 'camera' ? cam!.getFrameTexture(device) : composite;
      out = this.dsk.render(base, keyTex, state);
    }
    this.present.render(gpu.context, out, gpu.srgbView);
  }

  // --- still tier delegates (ADR-0015): the Renderer structurally implements the
  // GpuStillPort the persistence StillStore drives. ---

  readStill(): Promise<StillPixels> {
    return this.wipe.readStill();
  }

  currentGrab(): GrabCapture {
    return this.wipe.currentGrab();
  }

  injectStill(record: StillRecord): void {
    this.wipe.injectStill(record);
  }
}
