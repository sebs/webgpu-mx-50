// Headless model of browser media-device enumeration + permission gating (no navigator):
// inputs-and-devices.feature, Rule "Device access requires browser permission and reflects
// availability". Device labels are visible only after the matching permission is granted —
// made structural here: devices() returns [] until grant(). The browser adapters
// (camera/mic glue) and the cucumber World both drive this one class, so the permission
// rules are asserted headlessly while the real enumeration stays thin glue.

export type MediaPermission = 'prompt' | 'granted' | 'denied';
export type CatalogKind = 'videoinput' | 'audioinput';

export interface CatalogDevice {
  readonly deviceId: string;
  readonly label: string;
  readonly kind: CatalogKind;
}

export class MediaDeviceCatalog {
  private readonly perms: { videoinput: MediaPermission; audioinput: MediaPermission } = {
    videoinput: 'prompt',
    audioinput: 'prompt',
  };
  private list: CatalogDevice[] = [];

  /** Per-kind permission; both start at 'prompt'. */
  permission(kind: CatalogKind): MediaPermission {
    return this.perms[kind];
  }

  /** True when choosing a device of this kind must first trigger the browser prompt. */
  requiresPrompt(kind: CatalogKind): boolean {
    return this.perms[kind] === 'prompt';
  }

  /** Record a grant plus the devices enumerated after it (labels become visible now). */
  grant(kind: CatalogKind, devices: readonly CatalogDevice[]): void {
    this.perms[kind] = 'granted';
    this.mergeKind(kind, devices);
  }

  deny(kind: CatalogKind): void {
    this.perms[kind] = 'denied';
  }

  /** devicechange: replace the enumerated set; permission state unchanged. */
  refresh(devices: readonly CatalogDevice[]): void {
    this.list = devices.slice();
  }

  /** Devices a chooser sees now: [] until the matching permission is granted. */
  devices(kind: CatalogKind): readonly CatalogDevice[] {
    if (this.perms[kind] !== 'granted') return [];
    const out: CatalogDevice[] = [];
    for (let i = 0; i < this.list.length; i++) if (this.list[i]!.kind === kind) out.push(this.list[i]!);
    return out;
  }

  /** Replace this kind's entries, keeping the other kind's untouched. */
  private mergeKind(kind: CatalogKind, devices: readonly CatalogDevice[]): void {
    const kept: CatalogDevice[] = [];
    for (let i = 0; i < this.list.length; i++) if (this.list[i]!.kind !== kind) kept.push(this.list[i]!);
    this.list = kept.concat(devices.slice());
  }
}
