// Maps each selectable bus source (Source 1-4 or Matte) to a concrete Source (ADR-0008).
// The renderer asks the registry for "the source a bus resolves to" and never branches
// on kind. In Phase 1 the slots are generated test patterns and Matte is the MatteSource;
// real camera/video/image bindings slot in here in later phases without touching callers.

import type { BusSource } from '../core/types.js';
import type { Source } from './source.js';

export class SourceRegistry {
  private readonly sources = new Map<BusSource, Source>();

  set(id: BusSource, source: Source): void {
    this.sources.set(id, source);
  }

  get(id: BusSource): Source {
    const source = this.sources.get(id);
    if (!source) throw new Error(`No source registered for ${String(id)}`);
    return source;
  }

  has(id: BusSource): boolean {
    return this.sources.has(id);
  }

  all(): Source[] {
    return [...this.sources.values()];
  }

  /** Acquire every registered source (GPU allocation, media readiness). */
  async acquireAll(): Promise<void> {
    await Promise.all(this.all().map((source) => source.acquire()));
  }
}
