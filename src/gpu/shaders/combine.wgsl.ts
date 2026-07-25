// The Mix/Wipe combine stage (reference §9.1–§9.3). Composites the A-bus and B-bus
// textures either as a proportional cross-dissolve (Mix) or a non-additive brightness
// mix (NAM), driven by the lever. Compositing is in linear light (ADR-0005). The
// weights/rule are decided in core/transition.ts; this shader realises the pixels.

export const combineWGSL = /* wgsl */ `
struct Uniforms {
  mode : f32,   // 0 = Mix (cross-dissolve), 1 = NAM (per-pixel brighter)
  lever : f32,  // 0 = full A, 1 = full B
  _pad0 : f32,
  _pad1 : f32,
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

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  let a = textureSample(texA, samp, in.uv).rgb;
  let b = textureSample(texB, samp, in.uv).rgb;

  if (u.mode < 0.5) {
    // Mix: proportional cross-dissolve; lever 0 -> A, 1 -> B.
    return vec4f(mix(a, b, u.lever), 1.0);
  }

  // NAM: per-pixel brighter wins. Off-centre lever biases which bus dominates by fading
  // the other toward black (at the ends, one bus wins outright — reference §9.3).
  let fa = min(1.0, 2.0 * (1.0 - u.lever));
  let fb = min(1.0, 2.0 * u.lever);
  return vec4f(max(a * fa, b * fb), 1.0);
}
`;
