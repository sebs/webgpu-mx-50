// Storage backend abstraction (ADR-0015). The persistence module talks only to this narrow
// interface, so the browser wires the real localStorage while tests wire an in-memory Map —
// making the whole persistence layer headless-testable. Heavy binary blobs (captured stills)
// belong to a separate async BlobBackend (IndexedDB) that is deferred (browser-only).
//
// banira lib floor: index loops only (no Array methods that pre-ES2016 lib lacks).

export interface StorageBackend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

/** Backs onto a real Web Storage (window.localStorage) — browser only. */
export class LocalStorageBackend implements StorageBackend {
  constructor(private readonly ls: Storage) {}
  get(key: string): string | null {
    return this.ls.getItem(key);
  }
  set(key: string, value: string): void {
    this.ls.setItem(key, value);
  }
  remove(key: string): void {
    this.ls.removeItem(key);
  }
  keys(): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.ls.length; i++) {
      const k = this.ls.key(i);
      if (k !== null) out.push(k);
    }
    return out;
  }
}

/** In-memory backend (a Map) — the headless-test seam; survives a simulated reload while the map lives. */
export class MemoryStorageBackend implements StorageBackend {
  constructor(private readonly map = new Map<string, string>()) {}
  get(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  set(key: string, value: string): void {
    this.map.set(key, value);
  }
  remove(key: string): void {
    this.map.delete(key);
  }
  keys(): string[] {
    return Array.from(this.map.keys());
  }
}
