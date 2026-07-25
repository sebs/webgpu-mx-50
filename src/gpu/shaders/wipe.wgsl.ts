// The wipe combine shader (ADR-0009, reference §9.4). Each of the 7 families is an
// analytic signed field f(uv, progress, variant); the mask is smoothstep(-w, +w, f) and
// selects between the A-bus and B-bus textures. Soft sets the feather width w; Border
// draws a coloured band where |f| < borderWidth (colour = complement of the Matte, fed
// from the CPU). Reverse mirrors the coordinate; Aspect stretches the Square family;
// Multi tiles and Pairing mirrors the coordinate before evaluation. Compression/Slide/
// Blinds are modelled in the domain and are shader TODOs (fall through to the base field).

export const wipeWGSL = /* wgsl */ `
struct Uniforms {
  family : f32,
  variant : f32,
  progress : f32,
  softWidth : f32,
  borderWidth : f32,
  reverse : f32,
  aspect : f32,
  multi : f32,
  pairing : f32,
  _p0 : f32,
  _p1 : f32,
  _p2 : f32,
  borderColor : vec3f,
  _p3 : f32,
};

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var texA : texture_2d<f32>;
@group(0) @binding(2) var texB : texture_2d<f32>;
@group(0) @binding(3) var<uniform> u : Uniforms;

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

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  var uv = in.uv;
  if (u.reverse > 0.5) { uv = vec2f(1.0 - uv.x, 1.0 - uv.y); } // mirror travel
  if (u.pairing > 0.5) { uv = vec2f(abs(uv.x - 0.5) * 2.0, uv.y); } // mirror about centre
  if (u.multi > 0.5) { uv = vec2f(fract(uv.x * u.multi), uv.y); }   // tile the field

  let fam = u32(u.family + 0.5);
  let variant = u32(u.variant + 0.5);
  let f = fieldValue(fam, variant, uv, u.progress, u.aspect);

  let w = max(u.softWidth, 0.0025); // a hair of feather for anti-aliasing even on hard edges
  let mask = smoothstep(-w, w, f);

  let a = textureSample(texA, samp, in.uv).rgb;
  let b = textureSample(texB, samp, in.uv).rgb;
  var col = mix(a, b, mask);

  // Border: a coloured band straddling the boundary (|f| < borderWidth).
  if (u.borderWidth > 0.0 && abs(f) < u.borderWidth) {
    col = u.borderColor;
  }

  return vec4f(col, 1.0);
}
`;
