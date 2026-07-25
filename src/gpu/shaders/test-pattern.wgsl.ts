// The Phase 0 generated source: SMPTE-style vertical colour bars with a moving sweep
// line, produced entirely on the GPU into the linear working texture (ADR-0008,
// ADR-0005). The sweep is driven by the logical clock's tick (via the `phase`
// uniform) so a running app visibly updates every frame — proof the render loop and
// the whole source -> graph -> present chain are live.
//
// Values are written as LINEAR light (not sRGB-encoded); the present pass performs the
// single sRGB encode. Colours are therefore nominal, which is correct for a skeleton.

export const testPatternWGSL = /* wgsl */ `
struct Uniforms {
  resolution : vec2f,
  phase : f32,   // logical ticks (video frames) since start
  _pad : f32,
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
  // Seven vertical bars: white, yellow, cyan, green, magenta, red, blue.
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
  var col = bars[idx];

  // Bottom strip: a horizontal luminance ramp for a quick gamma sanity check.
  if (in.uv.y > 0.85) {
    col = vec3f(in.uv.x);
  }

  // Moving vertical sweep line — completes a pass roughly every 2 seconds at 60 fps.
  let sweep = fract(u.phase / 120.0);
  if (abs(in.uv.x - sweep) < 0.0035) {
    col = vec3f(1.0, 1.0, 1.0);
  }

  return vec4f(col, 1.0);
}
`;
