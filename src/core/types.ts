// Shared domain vocabulary for the mixer. Kept UI-free and GPU-free so the core
// engine (ADR-0004) and the state store (ADR-0011) stay headless and testable.

/** The two independent signal paths (ADR-0006). */
export type BusId = 'A' | 'B';

/** One of the four physical Source inputs. */
export type SourceSlot = 1 | 2 | 3 | 4;

/** What a bus may select: a numbered Source or the internal Matte (ADR-0006). */
export type BusSource = SourceSlot | 'matte';

/** Pixel dimensions. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

export const BUS_IDS: readonly BusId[] = ['A', 'B'];
export const SOURCE_SLOTS: readonly SourceSlot[] = [1, 2, 3, 4];
