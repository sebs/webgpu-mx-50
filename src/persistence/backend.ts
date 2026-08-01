// Storage backend abstraction (ADR-0015). The persistence module talks only to these narrow
// interfaces, so the browser wires the real localStorage/IndexedDB while tests wire
// in-memory Maps — making the whole persistence layer headless-testable. Heavy binary
// blobs (captured stills) live in the separate async BlobBackend tier: IndexedDB in the
// browser, a Map in tests.
//
// banira lib floor: index loops only (no Array methods that pre-ES2016 lib lacks).

import type { StillRecord } from '../core/positioner.js';

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

// --- async blob tier (captured stills, ADR-0015) ----------------------------

export interface BlobBackend {
  get(key: string): Promise<StillRecord | null>;
  set(key: string, record: StillRecord): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** In-memory Map-backed blob tier — the headless test seam. */
export class MemoryBlobBackend implements BlobBackend {
  constructor(private readonly map = new Map<string, StillRecord>()) {}
  get(key: string): Promise<StillRecord | null> {
    return Promise.resolve(this.map.has(key) ? this.map.get(key)! : null);
  }
  set(key: string, record: StillRecord): Promise<void> {
    this.map.set(key, record);
    return Promise.resolve();
  }
  remove(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
  keys(): Promise<string[]> {
    return Promise.resolve(Array.from(this.map.keys()));
  }
}

/**
 * Backs onto IndexedDB (db 'mx50', objectStore 'stills') — browser only, CI-excluded.
 * get()/keys() never reject (resolve null/[] on error — the readEnvelope never-throw
 * philosophy); set()/remove() reject so the StillStore can degrade explicitly.
 */
export class IndexedDbBlobBackend implements BlobBackend {
  private opened: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName = 'mx50',
    private readonly storeName = 'stills',
  ) {}

  private open(): Promise<IDBDatabase> {
    if (this.opened) return this.opened;
    this.opened = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(this.storeName)) {
          req.result.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.opened;
  }

  private request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    return this.open().then(
      (db) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(this.storeName, mode);
          const req = run(tx.objectStore(this.storeName));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => reject(req.error);
        }),
    );
  }

  get(key: string): Promise<StillRecord | null> {
    return this.request<StillRecord | undefined>('readonly', (s) => s.get(key)).then(
      (r) => r ?? null,
      () => null,
    );
  }
  set(key: string, record: StillRecord): Promise<void> {
    return this.request<unknown>('readwrite', (s) => s.put(record, key)).then(() => undefined);
  }
  remove(key: string): Promise<void> {
    return this.request<unknown>('readwrite', (s) => s.delete(key)).then(() => undefined);
  }
  keys(): Promise<string[]> {
    return this.request<IDBValidKey[]>('readonly', (s) => s.getAllKeys()).then(
      (ks) => {
        const out: string[] = [];
        for (let i = 0; i < ks.length; i++) if (typeof ks[i] === 'string') out.push(ks[i] as string);
        return out;
      },
      () => [],
    );
  }
}
