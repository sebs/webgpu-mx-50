// The Downstream Key pass (reference §10): keys a title source over the finished
// composite. The key window (Low/High) over the key source's luminance defines the
// characters, filled with the DSK fill colour; REVERSE swaps character/background. Phase 4
// renders Normal fill only — the border/shadow EDGE styles are a documented TODO.

export const dskWGSL = /* wgsl */ `
struct Uniforms {
  on : f32,
  low : f32,
  high : f32,
  reverse : f32,
  fill : vec3f,   // fill colour, linear
  _pad : f32,
};

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var composite : texture_2d<f32>;
@group(0) @binding(2) var keyTex : texture_2d<f32>;
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
  let comp = textureSample(composite, samp, in.uv).rgb;
  if (u.on < 0.5) {
    return vec4f(comp, 1.0); // DSK off: pass the composite through unchanged
  }
  let luma = dot(textureSample(keyTex, samp, in.uv).rgb, vec3f(0.299, 0.587, 0.114));
  let inWindow = luma >= u.low && luma <= u.high;
  var mask = select(0.0, 1.0, inWindow);
  if (u.reverse > 0.5) { mask = 1.0 - mask; }
  return vec4f(mix(comp, u.fill, mask), 1.0);
}
`;
