// Maps each selectable bus source (Source 1-4 or Matte) — plus the dedicated External
// Camera In — to a concrete Source (ADR-0008). The renderer asks the registry for "the
// source a bus resolves to" and never branches on kind. Real camera/video/image bindings
// slot in here via set() without touching callers; BusSource ⊂ RegistrySlot keeps
// 'ext-camera' out of bus resolution by type.

import type { BusSource } from '../core/types.js';
import type { Source } from './source.js';

export type RegistrySlot = BusSource | 'ext-camera';

export class SourceRegistry {
  private readonly sources = new Map<RegistrySlot, Source>();

  set(id: RegistrySlot, source: Source): void {
    this.sources.set(id, source);
  }

  get(id: RegistrySlot): Source {
    const source = this.sources.get(id);
    if (!source) throw new Error(`No source registered for ${String(id)}`);
    return source;
  }

  has(id: RegistrySlot): boolean {
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
