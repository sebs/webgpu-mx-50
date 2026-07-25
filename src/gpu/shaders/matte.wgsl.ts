// The internal Matte generator's fill (reference §4, ADR-0006/0008). Renders either the
// Colour Bar test pattern, or a flat linear colour with optional vertical GRADATION. The
// colour (with LEVEL already applied) is computed on the CPU in core/matte.ts and passed
// in; this shader just paints it. Output is linear; the present pass encodes sRGB.

export const matteWGSL = /* wgsl */ `
struct Uniforms {
  color : vec3f,     // flat linear RGB, LEVEL already applied
  gradation : f32,   // >0.5 = vertical gradient
  isBars : f32,      // >0.5 = render the Colour Bar pattern
};

@group(0) @binding(0) var<uniform> u : Uniforms;

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
  if (u.isBars > 0.5) {
    var bars = array<vec3f, 7>(
      vec3f(1.0, 1.0, 1.0),
      vec3f(1.0, 1.0, 0.0),
      vec3f(0.0, 1.0, 1.0),
      vec3f(0.0, 1.0, 0.0),
      vec3f(1.0, 0.0, 1.0),
      vec3f(1.0, 0.0, 0.0),
      vec3f(0.0, 0.0, 1.0),
    );
    let idx = min(u32(in.uv.x * 7.0), 6u);
    return vec4f(bars[idx], 1.0);
  }

  // Flat colour, ramped top(least)->bottom(full) when GRADATION is on (reference §4).
  let intensity = select(1.0, in.uv.y, u.gradation > 0.5);
  return vec4f(u.color * intensity, 1.0);
}
`;
