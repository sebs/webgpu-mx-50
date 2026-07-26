// The Mix/Wipe combine stage (reference §9.1–§9.3). Composites the A-bus and B-bus
// textures either as a proportional cross-dissolve (Mix) or a non-additive brightness
// mix (NAM), driven by the lever. Compositing is in linear light (ADR-0005). The
// weights/rule are decided in core/transition.ts; this shader realises the pixels.

export const combineWGSL = /* wgsl */ `
struct Uniforms {
  mode : f32,   // 0 = Mix, 1 = NAM, 2 = Luminance Key, 3 = Chroma Key
  lever : f32,  // 0 = full A, 1 = full B
  slice : f32,  // key SLICE (lum threshold / chroma tolerance)
  hue : f32,    // chroma HUE, 0..1
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

const LUMA = vec3f(0.299, 0.587, 0.114);

fn rgbToHue(c : vec3f) -> f32 {
  let mx = max(c.r, max(c.g, c.b));
  let mn = min(c.r, min(c.g, c.b));
  let d = mx - mn;
  if (d < 1e-5) { return 0.0; }
  var h = 0.0;
  if (mx == c.r) { h = (c.g - c.b) / d; }
  else if (mx == c.g) { h = 2.0 + (c.b - c.r) / d; }
  else { h = 4.0 + (c.r - c.g) / d; }
  h = h / 6.0;
  if (h < 0.0) { h = h + 1.0; }
  return h;
}
fn hueDistance(a : f32, b : f32) -> f32 {
  let d = abs(a - b);
  return min(d, 1.0 - d);
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  let a = textureSample(texA, samp, in.uv).rgb;
  let b = textureSample(texB, samp, in.uv).rgb;

  if (u.mode < 0.5) {
    // Mix: proportional cross-dissolve; lever 0 -> A, 1 -> B.
    return vec4f(mix(a, b, u.lever), 1.0);
  }

  if (u.mode < 1.5) {
    // NAM: per-pixel brighter wins; off-centre lever biases dominance (reference §9.3).
    let fa = min(1.0, 2.0 * (1.0 - u.lever));
    let fb = min(1.0, 2.0 * u.lever);
    return vec4f(max(a * fa, b * fb), 1.0);
  }

  if (u.mode < 2.5) {
    // Luminance Key (§9.5): B pixels at/above SLICE stay opaque; lever sets opacity.
    let lumaB = dot(b, LUMA);
    let mask = select(0.0, 1.0, lumaB >= u.slice);
    return vec4f(mix(a, b, mask * u.lever), 1.0);
  }

  // Chroma Key (§9.6): remove the HUE colour from B (show A); lever blends keyed<->unkeyed B.
  let d = hueDistance(rgbToHue(b), u.hue);
  let tol = u.slice * 0.4;
  let keyAlpha = 1.0 - smoothstep(tol - 0.05, tol + 0.05, d); // near hue -> removed
  let keyed = mix(b, a, keyAlpha);
  return vec4f(mix(b, keyed, u.lever), 1.0);
}
`;
