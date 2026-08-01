// The wipe combine shader (ADR-0009, reference §9.4). Each of the 7 families is an
// analytic signed field f(uv, progress, variant); the mask is smoothstep(-w, +w, f) and
// selects between the A-bus and B-bus textures. Soft sets the feather width w; Border
// draws a coloured band where |f| < borderWidth (colour = complement of the Matte, fed
// from the CPU). Reverse mirrors the coordinate (centred Split/Square families run inward
// instead); Aspect stretches the Square family; Multi tiles and Pairing mirrors the
// coordinate before evaluation. Compression/Slide sample an affine remap of the affected
// side's FULL frame (computed in core/wipe.ts); Blinds strip-tiles the mask coordinate.
// The Positioner branch renders the movable inset — a window onto B, a compressed whole-B
// PiP (reference §16 recipe 5), or the Scene-Grabber's frozen still riding with the inset
// (reference §7); its geometry helpers mirror core/positioner.ts exactly.

export const wipeWGSL = /* wgsl */ `
struct Uniforms {
  family : f32,        // s0
  variant : f32,       // s1
  progress : f32,      // s2
  softWidth : f32,     // s3
  borderWidth : f32,   // s4
  reverse : f32,       // s5
  aspect : f32,        // s6
  multi : f32,         // s7
  pairing : f32,       // s8
  posOn : f32,         // s9   Positioner active (PiP mode, reference §7)
  posX : f32,          // s10  joystick, -1..1
  posY : f32,          // s11
  borderColor : vec3f, // s12..14 (offset 48)
  posSize : f32,       // s15  EFFECTIVE inset size (lever-driven, core/positioner.ts)
  compression : f32,   // s16  0|1|2 (offset 64)
  slide : f32,         // s17  0|1|2
  blindsX : f32,       // s18  0|1
  blindsY : f32,       // s19  0|1
  remapB : vec4f,      // s20..23 sx, sy, ox, oy for the incoming (B) sample (offset 80)
  remapA : vec4f,      // s24..27 sx, sy, ox, oy for the outgoing (A) sample (offset 96)
  grabOn : f32,        // s28  Scene Grabber engaged (offset 112)
  grabCU : f32,        // s29  inset centre U at capture
  grabCV : f32,        // s30  inset centre V at capture
  grabHalf : f32,      // s31  inset half-extent at capture (size-hold)
  grabCompressed : f32,// s32  compression state at capture (offset 128)
  remapBOn : f32,      // s33  incoming remap is real (0 = degrade to a plain crop)
  remapAOn : f32,      // s34  outgoing remap is real
  _p2 : f32,           // s35
};

const BLINDS_STRIPS : f32 = 12.0;

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var texA : texture_2d<f32>;
@group(0) @binding(2) var texB : texture_2d<f32>;
@group(0) @binding(3) var<uniform> u : Uniforms;
@group(0) @binding(4) var texGrab : texture_2d<f32>; // Scene-Grabber freeze (pass-owned)

struct VSOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex : u32) -> VSOut {
  var clip = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let xy = clip[vertexIndex];
  var out : VSOut;
  out.position = vec4f(xy, 0.0, 1.0);
  out.uv = vec2f((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}

fn straightField(variant : u32, uv : vec2f, p : f32) -> f32 {
  if (variant == 0u) { return p - uv.x; }
  if (variant == 1u) { return p - (1.0 - uv.x); }
  if (variant == 2u) { return p - uv.y; }
  return p - (1.0 - uv.y);
}

fn cornerField(variant : u32, uv : vec2f, p : f32) -> f32 {
  var d = uv;
  if (variant == 1u) { d = vec2f(1.0 - uv.x, uv.y); }
  else if (variant == 2u) { d = vec2f(uv.x, 1.0 - uv.y); }
  else if (variant == 3u) { d = vec2f(1.0 - uv.x, 1.0 - uv.y); }
  return p - max(d.x, d.y);
}

fn diagonalField(variant : u32, uv : vec2f, p : f32) -> f32 {
  var x = uv.x;
  var y = uv.y;
  if (variant == 1u) { x = 1.0 - uv.x; }
  else if (variant == 2u) { y = 1.0 - uv.y; }
  else if (variant == 3u) { x = 1.0 - uv.x; y = 1.0 - uv.y; }
  return p - (x + y) * 0.5;
}

fn triangleField(variant : u32, uv : vec2f, p : f32) -> f32 {
  // Triangle rooted on an edge, widening toward the opposite side.
  if (variant == 0u) { return p * 1.5 - ((1.0 - uv.y) + abs(uv.x - 0.5)); } // from bottom
  if (variant == 1u) { return p * 1.5 - (uv.y + abs(uv.x - 0.5)); }         // from top
  if (variant == 2u) { return p * 1.5 - (uv.x + abs(uv.y - 0.5)); }         // from left
  return p * 1.5 - ((1.0 - uv.x) + abs(uv.y - 0.5));                        // from right
}

fn splitField(variant : u32, uv : vec2f, p : f32) -> f32 {
  let h = p * 0.5;
  if (variant == 0u) { return h - abs(uv.x - 0.5); }                     // V
  if (variant == 1u) { return h - abs(uv.y - 0.5); }                     // H
  return h - min(abs(uv.x - 0.5), abs(uv.y - 0.5));                      // cross / both
}

fn mosaicField(variant : u32, uv : vec2f, p : f32) -> f32 {
  // Straight boundary quantised to an 8x8 block grid (staircase / block edge).
  let bx = floor(uv.x * 8.0) / 8.0;
  let by = floor(uv.y * 8.0) / 8.0;
  let stair = f32(u32(floor(uv.y * 8.0)) % 2u) * 0.06;
  if (variant == 0u) { return p - (bx + stair); }
  if (variant == 1u) { return p - ((1.0 - bx) + stair); }
  if (variant == 2u) { return p - (by + stair); }
  return p - ((1.0 - by) + stair);
}

fn squareField(variant : u32, uv : vec2f, p : f32, aspect : f32) -> f32 {
  // Centred shape growing outward; variants swap the distance metric. ASPECT stretches.
  let c = (uv - vec2f(0.5)) * vec2f(1.0 + aspect, 1.0 - aspect);
  var d : f32;
  if (variant == 0u) { d = max(abs(c.x), abs(c.y)); }                 // square (Linf)
  else if (variant == 1u) { d = length(c); }                         // circle (L2)
  else if (variant == 2u) { d = length(c * vec2f(1.0, 1.4)); }       // oval
  else { d = abs(c.x) + abs(c.y); }                                  // diamond (L1)
  return p * 0.75 - d;
}

fn fieldValue(fam : u32, variant : u32, uv : vec2f, p : f32, aspect : f32) -> f32 {
  if (fam == 0u) { return straightField(variant, uv, p); }
  if (fam == 1u) { return cornerField(variant, uv, p); }
  if (fam == 2u) { return diagonalField(variant, uv, p); }
  if (fam == 3u) { return triangleField(variant, uv, p); }
  if (fam == 4u) { return splitField(variant, uv, p); }
  if (fam == 5u) { return mosaicField(variant, uv, p); }
  return squareField(variant, uv, p, aspect);
}

// Inset helpers — kept in lockstep with core/positioner.ts.
fn insetCentre(x : f32, y : f32) -> vec2f { return vec2f(0.5 + x * 0.4, 0.5 + y * 0.4); }
fn insetHalf(size : f32) -> f32 { return max(size, 0.02) * 0.5; }
fn compressedUV(uv : vec2f, centre : vec2f, half : f32) -> vec2f {
  return (uv - centre) / (2.0 * max(half, 0.005)) + vec2f(0.5);
}
fn windowRideUV(uv : vec2f, liveCentre : vec2f, grabCentre : vec2f) -> vec2f {
  return uv - liveCentre + grabCentre;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  // Positioner (reference §7): a movable, lever-sized Square inset showing B over A —
  // live window, compressed whole-B PiP, or the Scene-Grabber's frozen still.
  if (u.posOn > 0.5) {
    let liveCentre = insetCentre(u.posX, u.posY);
    let grabbed = u.grabOn > 0.5;
    let h = select(insetHalf(u.posSize), u.grabHalf, grabbed); // the still holds its captured size
    var suv : vec2f;
    if (grabbed) {
      if (u.grabCompressed > 0.5) { suv = compressedUV(in.uv, liveCentre, h); }
      else { suv = windowRideUV(in.uv, liveCentre, vec2f(u.grabCU, u.grabCV)); }
    } else if (u.compression > 0.5) {
      suv = compressedUV(in.uv, liveCentre, h); // live PiP: the whole B frame in the inset
    } else {
      suv = in.uv;                              // live window onto B
    }
    let live = textureSample(texB, samp, clamp(suv, vec2f(0.0), vec2f(1.0))).rgb;
    let frozen = textureSample(texGrab, samp, clamp(suv, vec2f(0.0), vec2f(1.0))).rgb;
    let a = textureSample(texA, samp, in.uv).rgb;
    let inset = select(live, frozen, grabbed);
    let dd = abs(in.uv - liveCentre);
    let dist = max(dd.x, dd.y);
    let e = max(u.softWidth, 0.004);
    var m = 1.0 - smoothstep(h - e, h + e, dist);
    if (u.reverse > 0.5) { m = 1.0 - m; } // REVERSE swaps inside/outside (spotlight trick)
    var col = mix(a, inset, m);
    if (u.borderWidth > 0.0 && abs(dist - h) < u.borderWidth) {
      col = u.borderColor;
    }
    return vec4f(col, 1.0);
  }

  var uv = in.uv;
  if (u.reverse > 0.5) { uv = vec2f(1.0 - uv.x, 1.0 - uv.y); } // mirror travel
  if (u.pairing > 0.5) { uv = vec2f(abs(uv.x - 0.5) * 2.0, uv.y); } // mirror about centre
  if (u.multi > 0.5) { uv = vec2f(fract(uv.x * u.multi), uv.y); }   // tile the field

  // Blinds (reference §9.4): venetian strips — a MASK-only coordinate op, so the
  // compressed/sliding imagery below stays whole while the reveal is stripy.
  var uvF = uv;
  if (u.blindsX > 0.5) { uvF.x = fract(uvF.x * BLINDS_STRIPS); }
  if (u.blindsY > 0.5) { uvF.y = fract(uvF.y * BLINDS_STRIPS); }

  let fam = u32(u.family + 0.5);
  let variant = u32(u.variant + 0.5);
  var f = fieldValue(fam, variant, uvF, u.progress, u.aspect);
  // Centred families (Split, Square) are invariant under the uv mirror, so REVERSE runs
  // them inward instead: the reveal contracts from the far state as the lever advances.
  // The endpoints snap to clean full-A / full-B frames — the inward boundary otherwise
  // parks at the pattern centre (a feathered blob / border band that never leaves).
  if (u.reverse > 0.5 && (fam == 4u || fam == 6u)) {
    f = -fieldValue(fam, variant, uvF, 1.0 - u.progress, u.aspect);
    if (u.progress >= 0.999) { f = 1.0; }
    if (u.progress <= 0.001) { f = -1.0; }
  }

  // Compression / Slide (reference §9.4): the affected side samples an affine remap of
  // its FULL frame (core/wipe.ts) instead of a crop. Applying the affine to the
  // pairing/multi-transformed uv yields one copy per tile / mirrored pair; the reverse
  // flip un-mirrors the imagery so Reverse only re-anchors the picture. When the CPU
  // supplies no real remap (remapOn = 0: inward-reversed families, non-rect complements)
  // the side degrades to a plain crop of the UNTRANSFORMED frame.
  var uvA = in.uv;
  var uvB = in.uv;
  if ((u.compression > 0.5 || u.slide > 0.5) && u.remapBOn > 0.5) {
    uvB = uv * u.remapB.xy + u.remapB.zw;
    if (u.reverse > 0.5) { uvB = vec2f(1.0) - uvB; }
  }
  if ((u.compression > 1.5 || u.slide > 1.5) && u.remapAOn > 0.5) {
    uvA = uv * u.remapA.xy + u.remapA.zw;
    if (u.reverse > 0.5) { uvA = vec2f(1.0) - uvA; }
  }

  let a = textureSample(texA, samp, clamp(uvA, vec2f(0.0), vec2f(1.0))).rgb;
  let b = textureSample(texB, samp, clamp(uvB, vec2f(0.0), vec2f(1.0))).rgb;

  let w = max(u.softWidth, 0.0025); // a hair of feather for anti-aliasing even on hard edges
  let mask = smoothstep(-w, w, f);

  var col = mix(a, b, mask);

  // Border: a coloured band straddling the boundary (and, under Blinds, every strip edge).
  if (u.borderWidth > 0.0 && abs(f) < u.borderWidth) {
    col = u.borderColor;
  }

  return vec4f(col, 1.0);
}
`;
