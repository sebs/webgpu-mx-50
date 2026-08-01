// Pure half of the preset file import/export glue (ADR-0015 portable presets): filename
// building, feedback formatting, and the size guard — everything decision-shaped, fully
// unit-tested. The browser DOM half (download/upload) lives in file-io.ts and stays thin.
//
// banira lib floor: manual zero-padding (no padStart), no Array.includes / ** .

import type { ExportTarget, ImportResult } from './persistence.js';

export type PresetKind = ExportTarget['kind'];

export interface FileStamp {
  year: number;
  month: number; // 1-based
  day: number;
  hour: number;
  minute: number;
}

/** Local-time projection of a Date; the single impure Date read stays in the caller. */
export function stampFromDate(d: Date): FileStamp {
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

const KIND_SLUG: Record<PresetKind, string> = { bank: 'bank', settings: 'settings', fieldPreset: 'field-preset' };

/** 'mx50-bank-20260801-1432.json' — kebab kind, sortable local stamp, no reserved characters. */
export function presetFileName(kind: PresetKind, stamp: FileStamp): string {
  const date = String(stamp.year) + pad2(stamp.month) + pad2(stamp.day);
  const time = pad2(stamp.hour) + pad2(stamp.minute);
  return 'mx50-' + KIND_SLUG[kind] + '-' + date + '-' + time + '.json';
}

/** ImportResult plus the glue-level failures that never reach the pure codec. */
export type ImportOutcome = ImportResult | { ok: false; reason: 'read-error' | 'too-large' | 'storage-full' };

/** One status line per outcome. `occupied` = stored-slot count when a bank went live. */
export function importFeedback(outcome: ImportOutcome, occupied?: number): string {
  if (outcome.ok === true) {
    if (outcome.target === 'bank') return 'Bank imported · ' + (occupied ?? 0) + ' stored';
    if (outcome.target === 'fieldPreset') return 'Field preset imported · applies at next launch under Reset OFF';
    return 'Settings imported · applies at next launch';
  }
  const failed = outcome as { ok: false; reason: string };
  switch (failed.reason) {
    case 'corrupt':
      return 'Import failed · not an MX-50 preset file';
    case 'unsupported-version':
      return 'Import failed · made by a newer version';
    case 'read-error':
      return 'Import failed · the file could not be read';
    case 'too-large':
      return 'Import failed · file too large';
    case 'storage-full':
      return 'Import failed · browser storage is full';
    default:
      return 'Import failed';
  }
}

export function exportFeedback(kind: PresetKind, fileName: string): string {
  return 'Exported ' + fileName;
}

export const PRESET_MIME = 'application/json';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
