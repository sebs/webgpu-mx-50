// Persisted-object envelope + versioning (ADR-0015). Every stored value carries a
// schemaVersion; reads run through a migration step and NEVER throw — an unrecognised or
// corrupt payload is treated as "empty" (returns null), so the boot path falls back to the
// factory preset instead of crashing. This is the one place the storage format is defined.

import type { StorageBackend } from './backend.js';

export const SCHEMA_VERSION = 1;

export const KEY_SETTINGS = 'mx50:settings';
export const KEY_FIELD_PRESET = 'mx50:fieldPreset';
export const KEY_BANK = 'mx50:eventMemory';

export interface Envelope<T> {
  schemaVersion: number;
  data: T;
}

/** Wrap `data` in the current-version envelope and write it as JSON. */
export function writeEnvelope<T>(backend: StorageBackend, key: string, data: T): void {
  backend.set(key, JSON.stringify({ schemaVersion: SCHEMA_VERSION, data }));
}

/**
 * Read and unwrap an envelope, or null if absent / unparseable / unversioned / a version this
 * build cannot migrate. Total and crash-proof: any malformed payload reads as null.
 */
export function readEnvelope<T>(backend: StorageBackend, key: string): T | null {
  const raw = backend.get(key);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const env = parsed as Partial<Envelope<T>>;
  if (typeof env.schemaVersion !== 'number') return null;
  if (migrate(env as Envelope<unknown>) === null) return null;
  return (env.data as T) ?? null;
}

/** Upgrade an older envelope to the current shape, or null if it cannot be migrated. */
function migrate(env: Envelope<unknown>): Envelope<unknown> | null {
  // v1 is current; no forward migration from a future/unknown version.
  return env.schemaVersion === SCHEMA_VERSION ? env : null;
}
