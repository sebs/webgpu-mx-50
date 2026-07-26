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

// The fixed hardware flow (ADR-0004, reference §1) splits into three parts around the
// point where the two buses converge:
//   per-bus (1-in, run once per bus) → mix/wipe combine (2-in) → downstream (1-in)

/** Per-bus stages, run independently on the A-bus and B-bus branch (1 texture in/out). */
export const PER_BUS_STAGES = ['colour-correction', 'digital-effect'] as const;

/** The bus-combining stage where the two branches converge (2 textures in, 1 out). */
export const COMBINE_STAGE = 'mix-wipe' as const;

/** Downstream stages, run on the single composite after combine (1 texture in/out). */
export const DOWNSTREAM_STAGES = ['downstream-key', 'fade'] as const;

/** The complete fixed stage order, source → Program Out (ADR-0004, reference §1). */
export const STAGE_ORDER = [...PER_BUS_STAGES, COMBINE_STAGE, ...DOWNSTREAM_STAGES] as const;

export type StageName = (typeof STAGE_ORDER)[number];

/** Whether stage `a` runs strictly before stage `b` in the fixed flow (ADR-0004). */
export function stageIsBefore(a: StageName, b: StageName): boolean {
  return STAGE_ORDER.indexOf(a) < STAGE_ORDER.indexOf(b);
}

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

/** The per-bus branch (colour correction, digital effect). Pass-through until Phase 3+. */
export function createPerBusGraph<F>(): SignalGraph<F> {
  return new SignalGraph<F>(PER_BUS_STAGES.map((name) => new PassthroughStage<F>(name)));
}

/** The downstream branch (DSK, fade), applied after combine. Pass-through until Phase 4+. */
export function createDownstreamGraph<F>(): SignalGraph<F> {
  return new SignalGraph<F>(DOWNSTREAM_STAGES.map((name) => new PassthroughStage<F>(name)));
}
