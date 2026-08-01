// The Trail accumulate/composite shader (ADR-0007 ping-pong accumulator, reference §8.8).
// ONE fragment entry point serves both draws, uniform-driven:
//   bake (spawn ticks): decay = TRAIL_DECAY, opacity = TRAIL_BAKE_OPACITY, accum ping → pong;
//   lead (every frame): decay = 1.0, opacity = 1.0, accum → out (compressed live copy on top).

export const trailWGSL = /* wgsl */ `
struct Uniforms {
  rect : vec4f,    // copy rect: x, y (top-left, UV y-down), width, height
  decay : f32,     // previous-accumulation multiplier (1.0 = keep as-is)
  opacity : f32,   // weight of the copy drawn inside rect (1.0 = opaque)
  _p0 : f32,
  _p1 : f32,
};

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var accTex : texture_2d<f32>;  // the trail so far
@group(0) @binding(2) var srcTex : texture_2d<f32>;  // live or frozen bus frame
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

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  // Sample unconditionally (uniform control flow), select with a mask.
  let ghost = textureSample(accTex, samp, in.uv).rgb * u.decay;
  let copyUv = (in.uv - u.rect.xy) / max(u.rect.zw, vec2f(0.0001));
  let copy = textureSample(srcTex, samp, clamp(copyUv, vec2f(0.0), vec2f(1.0))).rgb;
  let lo = step(u.rect.xy, in.uv);
  let hi = step(in.uv, u.rect.xy + u.rect.zw);
  let inside = lo.x * lo.y * hi.x * hi.y;
  return vec4f(mix(ghost, copy, inside * u.opacity), 1.0);
}
`;
