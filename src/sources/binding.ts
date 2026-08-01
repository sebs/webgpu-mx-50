// Which browser media provider backs each of the four Source inputs (ADR-0008,
// inputs-and-devices.feature). This is the browser reinterpretation of the hardware's
// physical jacks: no composite-vs-S-Video priority — each source has exactly ONE
// active binding to a camera device, a video file, an image, or a generated source.
//
// This model is pure and headless (no DOM, no GPU), so it is exercised directly by the
// Gherkin domain specs. Selecting WHICH source occupies a bus is the store's job
// (ADR-0006); selecting WHAT device/file backs a source is bound here.

import { SOURCE_SLOTS } from '../core/types.js';
import type { SourceSlot } from '../core/types.js';
import type { SourceKind } from './source.js';

export interface Binding {
  readonly kind: SourceKind;
  readonly providerId: string;
  /** Camera and video carry audio; image and generated do not. */
  readonly hasAudio: boolean;
  /** An image is a single unchanging frame. */
  readonly still: boolean;
  /** False when the backing device was lost/disconnected. */
  available: boolean;
}

const AUDIO_KINDS: ReadonlySet<SourceKind> = new Set<SourceKind>(['camera', 'video']);

/** What may back the dedicated External Camera In (DSK key only, reference §10). */
export type ExtCameraKind = 'camera' | 'video';

export class SourceBindingRegistry {
  private readonly bindings = new Map<SourceSlot, Binding>();
  /** The External Camera In binding — never offered as a bus source. */
  private extCam: Binding | null = null;

  get slots(): readonly SourceSlot[] {
    return SOURCE_SLOTS;
  }

  /** Bind a source to a provider, replacing any previous binding for that slot. */
  bind(slot: SourceSlot, kind: SourceKind, providerId: string): Binding {
    const binding: Binding = {
      kind,
      providerId,
      hasAudio: AUDIO_KINDS.has(kind),
      still: kind === 'image',
      available: true,
    };
    this.bindings.set(slot, binding);
    return binding;
  }

  get(slot: SourceSlot): Binding | undefined {
    return this.bindings.get(slot);
  }

  isBound(slot: SourceSlot): boolean {
    return this.bindings.has(slot);
  }

  clear(slot: SourceSlot): void {
    this.bindings.delete(slot);
  }

  /** The provider actually feeding a slot: null when unbound OR the binding is unavailable. */
  activeProvider(slot: SourceSlot): string | null {
    const b = this.bindings.get(slot);
    return b && b.available ? b.providerId : null;
  }

  /** Mark every slot (and the External Camera) backed by this provider as unavailable. */
  markUnavailable(providerId: string): void {
    for (const binding of this.bindings.values()) {
      if (binding.providerId === providerId) binding.available = false;
    }
    if (this.extCam && this.extCam.providerId === providerId) this.extCam.available = false;
  }

  /**
   * Distinct available providers — each is offered for selection on either bus. The
   * External Camera binding is deliberately absent: it is never a bus source (§10).
   */
  availableProviders(): string[] {
    const ids = new Set<string>();
    for (const binding of this.bindings.values()) {
      if (binding.available) ids.add(binding.providerId);
    }
    return [...ids];
  }

  /** Bind the External Camera In (DSK key only — never offered as a bus source). */
  bindExtCamera(kind: ExtCameraKind, providerId: string): Binding {
    this.extCam = { kind, providerId, hasAudio: true, still: false, available: true };
    return this.extCam;
  }

  getExtCamera(): Binding | null {
    return this.extCam;
  }

  clearExtCamera(): void {
    this.extCam = null;
  }

  /** The DSK has a real key feed: bound and its device still present. */
  extCameraAvailable(): boolean {
    return this.extCam !== null && this.extCam.available;
  }
}
