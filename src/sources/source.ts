// The uniform Source interface (ADR-0008). The signal graph, buses, and render loop
// program against this one type and never branch on kind. Every implementation
// delivers a GPU texture for the current frame in the linear working space (ADR-0005),
// plus its intrinsic size and a readiness flag.
//
// Phase 0 implements only GeneratedSource. Camera/video (which use the zero-copy
// importExternalTexture path and return a GPUExternalTexture) and still images are
// deferred to Phase 1+; the interface is shaped to accommodate them.

import type { Size } from '../core/types.js';

export type SourceKind = 'camera' | 'video' | 'image' | 'generated';

export interface Source {
  readonly kind: SourceKind;

  /** False until async setup completes (permission, metadata load, GPU alloc). */
  readonly isReady: boolean;

  /** Native size of the source content. */
  readonly intrinsicSize: Size;

  /** Perform async setup (permission prompt, decode, GPU resource allocation). */
  acquire(): Promise<void>;

  /** A GPU texture for the current frame in the linear working space (ADR-0005). */
  getFrameTexture(device: GPUDevice): GPUTexture;

  /** Release GPU/media resources. */
  release(): void;
}
