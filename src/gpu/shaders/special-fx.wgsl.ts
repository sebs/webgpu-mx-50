// The Special-Mode macro shader (reference §14): renders one SpecialFrame — a background
// layer (A, B, Matte, or black) with a foreground layer compressed into a movable,
// rotatable inset (rect or ellipse), or the Mosaic-Mix crossfade whose sample grid
// coarsens mid-transition. All geometry comes precomputed from
// core/special-mode-geometry.ts; every branch conditions on uniforms only, so the
// textureSample calls stay in uniform control flow.

export const specialFxWGSL = /* wgsl */ `
struct Uniforms {
  center : vec2f,   // s0..1
  halfExt : vec2f,  // s2..3  (0.5, 0.5 = full frame)
  angle : f32,      // s4     radians
  shape : f32,      // s5     0 rect, 1 ellipse
  bg : f32,         // s6     0=A 1=B 2=matte 3=black
  fg : f32,         // s7     0=A 1=B 2=none
  mixAmt : f32,     // s8
  mosaic : f32,     // s9
  _p1 : f32,        // s10
  _p2 : f32,        // s11
};

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var texA : texture_2d<f32>;
@group(0) @binding(2) var texB : texture_2d<f32>;
@group(0) @binding(3) var texM : texture_2d<f32>; // Matte frame (honours GRADATION)
@group(0) @binding(4) var<uniform> u : Uniforms;

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

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  // Mosaic Mix: quantise the sample grid; strength sets coarseness.
  var uv = in.uv;
  if (u.mosaic > 0.001) {
    let blocks = mix(160.0, 10.0, u.mosaic);
    uv = (floor(in.uv * blocks) + 0.5) / blocks;
  }
  // Inset space: translate, rotate by -angle, normalise by half-extents.
  let d = in.uv - u.center;
  let c = cos(u.angle);
  let s = sin(u.angle);
  let rd = vec2f(c * d.x + s * d.y, -s * d.x + c * d.y);
  let n = vec2f(rd.x / max(u.halfExt.x, 1e-5), rd.y / max(u.halfExt.y, 1e-5));
  let insetUv = n * 0.5 + vec2f(0.5, 0.5); // full source frame compressed into the inset
  // All samples up front: keeps textureSample in uniform control flow.
  let aFull = textureSample(texA, samp, uv).rgb;
  let bFull = textureSample(texB, samp, uv).rgb;
  let mFull = textureSample(texM, samp, in.uv).rgb;
  let cuv = clamp(insetUv, vec2f(0.0), vec2f(1.0));
  let aIn = textureSample(texA, samp, cuv).rgb;
  let bIn = textureSample(texB, samp, cuv).rgb;
  if (u.fg > 1.5) { // fg = none -> the Mosaic-Mix crossfade IS the picture
    return vec4f(mix(aFull, bFull, u.mixAmt), 1.0);
  }
  var col : vec3f;
  if (u.bg < 0.5) { col = aFull; }
  else if (u.bg < 1.5) { col = bFull; }
  else if (u.bg < 2.5) { col = mFull; }
  else { col = vec3f(0.0); }
  var nd : f32;
  if (u.shape < 0.5) { nd = max(abs(n.x), abs(n.y)); } else { nd = length(n); }
  var m = 1.0 - smoothstep(0.985, 1.0, nd); // feathered inset edge
  if (u.halfExt.x < 1e-4 || u.halfExt.y < 1e-4) { m = 0.0; } // degenerate inset
  let fgCol = select(bIn, aIn, u.fg < 0.5);
  return vec4f(mix(col, fgCol, m), 1.0);
}
`;
