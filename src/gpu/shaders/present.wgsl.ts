// Present pass: a fullscreen triangle that samples the final Program-Out texture and
// writes it to the canvas' sRGB view (the single linear->sRGB encode, ADR-0005).
// WGSL is authored as a string module because there is no bundler (ADR-0003).

export const presentWGSL = /* wgsl */ `
struct VSOut {
  @builtin(position) position : vec4f,
  @location(0) uv : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex : u32) -> VSOut {
  // Oversized triangle covering the viewport.
  var clip = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let xy = clip[vertexIndex];
  var out : VSOut;
  out.position = vec4f(xy, 0.0, 1.0);
  // Screen-space UV: (0,0) top-left, (1,1) bottom-right.
  out.uv = vec2f((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var tex : texture_2d<f32>;

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}
`;
