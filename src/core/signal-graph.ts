// Explicit, fixed-order signal graph mirroring the hardware flow (ADR-0004):
//
//   Source -> Colour Correction -> Digital Effect -> Mix/Wipe -> Downstream Key -> Fade -> Program Out
//
// Each stage reads one frame and produces one frame. In Phase 0 every stage past
// the source is a pass-through, but the ORDER is structural and cannot drift — the
// whole point of ADR-0004. The graph is generic over the frame type so it can be
// exercised headlessly (no GPU) in tests: in the browser F = GPUTexture.

/** A single processing stage. Given an input frame, returns an output frame. */
export interface Stage<F> {
  readonly name: string;
  execute(input: F): F;
}

/** A stage that returns its input unchanged (a disabled/not-yet-implemented stage). */
export class PassthroughStage<F> implements Stage<F> {
  constructor(public readonly name: string) {}
  execute(input: F): F {
    return input;
  }
}

/** The fixed hardware stage order past a bus's source (ADR-0004, reference §1). */
export const STAGE_ORDER = [
  'colour-correction',
  'digital-effect',
  'mix-wipe',
  'downstream-key',
  'fade',
] as const;

export type StageName = (typeof STAGE_ORDER)[number];

/** An ordered chain of stages folded from source frame to Program Out frame. */
export class SignalGraph<F> {
  constructor(public readonly stages: readonly Stage<F>[]) {}

  /** Fold the input frame through every stage, in order. */
  run(input: F): F {
    let frame = input;
    for (const stage of this.stages) {
      frame = stage.execute(frame);
    }
    return frame;
  }

  get stageNames(): readonly string[] {
    return this.stages.map((s) => s.name);
  }
}

/**
 * Build the Phase 0 graph: the full hardware stage order, every stage a
 * pass-through. Later phases replace individual stages with real GPU passes
 * without changing the order or the graph's shape.
 */
export function createPhase0Graph<F>(): SignalGraph<F> {
  return new SignalGraph<F>(STAGE_ORDER.map((name) => new PassthroughStage<F>(name)));
}
