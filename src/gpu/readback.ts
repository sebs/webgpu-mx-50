// Pure texture-readback math (ADR-0015 still tier): WebGPU's copyTextureToBuffer requires
// bytesPerRow aligned to 256, so a read-back frame carries row padding that must be
// stripped to the tight RGBA8 layout the blob tier stores. Node-testable — no GPU calls.

export const ROW_ALIGN = 256;

/** bytesPerRow for a width, rounded up to the 256-byte alignment copyTextureToBuffer demands. */
export function alignedBytesPerRow(width: number): number {
  return Math.ceil((width * 4) / ROW_ALIGN) * ROW_ALIGN;
}

/** Strip per-row padding from a mapped readback into a tight width*4*height RGBA8 buffer. */
export function packTightRows(padded: Uint8Array, bytesPerRow: number, width: number, height: number): ArrayBuffer {
  const tightRow = width * 4;
  const out = new Uint8Array(tightRow * height);
  for (let y = 0; y < height; y++) {
    out.set(padded.subarray(y * bytesPerRow, y * bytesPerRow + tightRow), y * tightRow);
  }
  return out.buffer;
}
