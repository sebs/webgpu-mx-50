// Browser half of the preset file import/export glue (ADR-0015 portable presets): the
// Blob download and the hidden file-picker upload, following the demo-feeds picker
// pattern. Everything decision-shaped (naming, feedback, size cap, LOAD_BANK semantics)
// lives in the pure seams (preset-file.ts, persistence.ts, the reducer); this module is
// thin, CI-excluded, and resolves `document` at call time. Both entries are synchronous
// up to the click, so they run inside the operator's button-press user activation.

import { MAX_IMPORT_BYTES, PRESET_MIME, exportFeedback, importFeedback, presetFileName, stampFromDate } from './preset-file.js';
import type { ImportOutcome, PresetKind } from './preset-file.js';
import type { ImportResult, Persistence } from './persistence.js';
import type { PanelStore } from '../state/store.js';

export interface PresetFileIoDeps {
  persistence: Persistence;
  store: PanelStore;
  /** Injected; called once per export CLICK — an event handler, never the render loop. */
  now: () => Date;
  doc?: Document;
}

export interface PresetFileIo {
  /** Synchronous: build JSON via persistence, name it, trigger the download; returns the status line. */
  exportPreset(kind: PresetKind): string;
  /** Opens the picker (call inside a user-gesture handler); reads, imports, makes a bank
   *  live via LOAD_BANK, reports exactly once via done. Picker cancel = silent no-op. */
  importPreset(done: (feedback: string, ok: boolean) => void): void;
}

/** Blob download via a transient in-DOM anchor (Firefox needs it attached); revoke deferred one task. */
export function downloadJson(fileName: string, json: string, doc: Document = document): void {
  const blob = new Blob([json], { type: PRESET_MIME });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = fileName;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createPresetFileIo(deps: PresetFileIoDeps): PresetFileIo {
  const doc = deps.doc ?? document;
  // One persistent hidden input with ONE persistent change listener (a cancelled picker
  // fires no event, so per-call listeners would accumulate and a later pick would run
  // every stale handler). importPreset() just points `pendingDone` at the current
  // callback; value reset before each open so re-importing the same file re-fires change.
  let input: HTMLInputElement | null = null;
  let pendingDone: ((feedback: string, ok: boolean) => void) | null = null;
  const picker = (): HTMLInputElement => {
    if (!input) {
      input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.hidden = true;
      doc.body.appendChild(input);
      input.addEventListener('change', () => {
        const done = pendingDone;
        pendingDone = null;
        if (done) handlePick(input!, done);
      });
    }
    return input;
  };

  const handlePick = (el: HTMLInputElement, done: (feedback: string, ok: boolean) => void): void => {
    const fail = (reason: 'read-error' | 'too-large' | 'storage-full'): void =>
      done(importFeedback({ ok: false, reason } as ImportOutcome), false);
    const file = el.files && el.files[0];
    if (!file) return; // nothing picked: silent no-op
    if (file.size > MAX_IMPORT_BYTES) {
      fail('too-large');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => fail('read-error');
    reader.onabort = () => fail('read-error');
    reader.onload = () => {
      let result: ImportResult;
      try {
        result = deps.persistence.importPreset(String(reader.result));
      } catch {
        // LocalStorageBackend.set throws QuotaExceededError through importPreset.
        fail('storage-full');
        return;
      }
      let occupied = 0;
      if (result.ok && result.target === 'bank') {
        // Re-reading through loadBank() reuses the tested normalizeBank.
        deps.store.dispatch({ type: 'LOAD_BANK', slots: deps.persistence.loadBank() });
        const slots = deps.store.getSnapshot().memory.slots;
        for (let i = 0; i < slots.length; i++) if (slots[i] !== null) occupied++;
      }
      done(importFeedback(result, occupied), result.ok);
    };
    reader.readAsText(file);
  };

  return {
    exportPreset(kind) {
      const json = deps.persistence.exportPreset({ kind });
      const name = presetFileName(kind, stampFromDate(deps.now()));
      downloadJson(name, json, doc);
      return exportFeedback(kind, name);
    },

    importPreset(done) {
      const el = picker();
      pendingDone = done; // a cancelled prior pick is simply overwritten — one listener, ever
      el.value = '';
      el.click();
    },
  };
}
