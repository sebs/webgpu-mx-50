// The persistence module (ADR-0015): the SINGLE owner of browser storage. It serialises the
// ADR-0011 store's persistable projection (panelSnapshot) — Event Memory bank, the field
// preset, and settings — via an injectable StorageBackend, so live state and saved state share
// one representation and the whole layer is headless-testable. IndexedDB still-blob tiers and
// file download/upload glue are browser-only and live outside this pure core.

import { bootState } from '../app.js';
import { EMPTY_MEMORY, freshMemory, freshSpecialMode, panelSnapshot } from '../state/state.js';
import { KEY_BANK, KEY_BINDINGS, KEY_FIELD_PRESET, KEY_SETTINGS, SCHEMA_VERSION, readEnvelope, writeEnvelope } from './schema.js';
import type { StorageBackend } from './backend.js';
import type { PanelSnapshot, PanelState, ResetMode } from '../state/state.js';
import type { BindingMap } from '../control/bindings.js';

export interface Settings {
  reset: ResetMode;
}

export type ExportTarget = { kind: 'bank' } | { kind: 'settings' } | { kind: 'fieldPreset' };
export type ImportResult =
  | { ok: true; target: ExportTarget['kind'] }
  | { ok: false; reason: 'corrupt' | 'unsupported-version' };

export interface Persistence {
  loadSettings(): Settings;
  saveSettings(settings: Settings): void;
  saveBank(slots: (PanelSnapshot | null)[]): void;
  loadBank(): (PanelSnapshot | null)[];
  clearBank(): void;
  captureFieldPreset(state: PanelState): void;
  readFieldPreset(): PanelSnapshot | null;
  clearFieldPreset(): void;
  restoreOnBoot(): PanelState;
  exportPreset(target: ExportTarget): string;
  importPreset(json: string): ImportResult;
  // Control-mapping binding table (ADR-0014) — its own key, remap survives reloads.
  loadBindings(): BindingMap | null;
  saveBindings(map: BindingMap): void;
  clearBindings(): void;
}

const BANK_SIZE = 8;

/** Normalise a read-back bank to exactly 8 slots (absent/short/corrupt → padded with nulls). */
function normalizeBank(raw: (PanelSnapshot | null)[] | null): (PanelSnapshot | null)[] {
  const out: (PanelSnapshot | null)[] = [];
  for (let i = 0; i < BANK_SIZE; i++) out.push(raw && i < raw.length ? (raw[i] ?? null) : null);
  return out;
}

export function createPersistence(backend: StorageBackend): Persistence {
  const self: Persistence = {
    loadSettings() {
      const s = readEnvelope<Settings>(backend, KEY_SETTINGS);
      return s && (s.reset === 'on' || s.reset === 'off') ? s : { reset: 'on' };
    },
    saveSettings(settings) {
      writeEnvelope(backend, KEY_SETTINGS, settings);
    },
    saveBank(slots) {
      writeEnvelope(backend, KEY_BANK, normalizeBank(slots));
    },
    loadBank() {
      return normalizeBank(readEnvelope<(PanelSnapshot | null)[]>(backend, KEY_BANK));
    },
    clearBank() {
      backend.remove(KEY_BANK);
    },
    captureFieldPreset(state) {
      writeEnvelope(backend, KEY_FIELD_PRESET, panelSnapshot(state));
    },
    readFieldPreset() {
      return readEnvelope<PanelSnapshot>(backend, KEY_FIELD_PRESET);
    },
    clearFieldPreset() {
      backend.remove(KEY_FIELD_PRESET);
    },
    restoreOnBoot() {
      const settings = self.loadSettings();
      const snap = settings.reset === 'off' ? self.readFieldPreset() : null;
      const savedPanel: PanelState | null = snap
        ? ({ ...snap, memory: freshMemory(), specialMode: freshSpecialMode() } as PanelState)
        : null;
      const base = bootState(settings.reset, savedPanel);
      // The bank is layered on regardless of Reset policy, so memories survive a normal power
      // cycle even under Reset ON's factory restore; Special Mode always boots off.
      return { ...base, memory: { ...EMPTY_MEMORY, slots: self.loadBank() }, specialMode: freshSpecialMode() };
    },
    exportPreset(target) {
      const data =
        target.kind === 'bank'
          ? self.loadBank()
          : target.kind === 'settings'
            ? self.loadSettings()
            : self.readFieldPreset();
      return JSON.stringify({ schemaVersion: SCHEMA_VERSION, target: target.kind, data });
    },
    loadBindings() {
      return readEnvelope<BindingMap>(backend, KEY_BINDINGS);
    },
    saveBindings(map) {
      writeEnvelope(backend, KEY_BINDINGS, map);
    },
    clearBindings() {
      backend.remove(KEY_BINDINGS);
    },
    importPreset(json) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        return { ok: false, reason: 'corrupt' };
      }
      if (parsed === null || typeof parsed !== 'object') return { ok: false, reason: 'corrupt' };
      const env = parsed as { schemaVersion?: unknown; target?: unknown; data?: unknown };
      if (typeof env.schemaVersion !== 'number') return { ok: false, reason: 'corrupt' };
      if (env.schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: 'unsupported-version' };
      if (env.target === 'bank') self.saveBank(normalizeBank((env.data as (PanelSnapshot | null)[]) ?? null));
      else if (env.target === 'settings') self.saveSettings(env.data as Settings);
      else if (env.target === 'fieldPreset') writeEnvelope(backend, KEY_FIELD_PRESET, env.data);
      else return { ok: false, reason: 'corrupt' };
      return { ok: true, target: env.target };
    },
  };
  return self;
}
