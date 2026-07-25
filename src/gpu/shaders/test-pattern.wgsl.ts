// The Phase 1 generated source for the four Source slots: a distinct colour field per
// `variant`, with a vertical brightness gradient and a moving bright sweep bar. Distinct
// hues make a Mix (cross-dissolve) visibly blend, and the bright sweep gives NAM
// (per-pixel brighter wins) something to punch through. Rendered on the GPU into the
// linear working texture (ADR-0008, ADR-0005); the present pass does the sRGB encode.

export const testPatternWGSL = /* wgsl */ `
struct Uniforms {
  resolution : vec2f,
  phase : f32,    // logical ticks since start
  variant : f32,  // 0..3, selects the base hue
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
  // Four distinct base hues for the four Source slots.
  var hues = array<vec3f, 4>(
    vec3f(0.90, 0.25, 0.20),  // Source 1 — red
    vec3f(0.20, 0.75, 0.30),  // Source 2 — green
    vec3f(0.25, 0.45, 0.95),  // Source 3 — blue
    vec3f(0.95, 0.65, 0.15),  // Source 4 — amber
  );
  let idx = min(u32(u.variant), 3u);
  let base = hues[idx];

  // Vertical brightness gradient: dim at top, bright at bottom — gives NAM contrast.
  let brightness = 0.25 + 0.75 * in.uv.y;
  var col = base * brightness;

  // Moving bright sweep bar (skewed), the brightest thing on screen.
  let sweep = fract(u.phase / 90.0 + in.uv.y * 0.25);
  if (abs(in.uv.x - sweep) < 0.03) {
    col = vec3f(1.0, 1.0, 1.0);
  }

  return vec4f(col, 1.0);
}
`;
