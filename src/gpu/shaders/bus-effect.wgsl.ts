// The per-bus processing shader (ADR-0004 per-bus stages): Colour Correction followed by
// the filter-family Digital Effects (Nega, Mosaic, Mono, Paint), in the fixed flow order.
// One pass per bus. Mono overrides Colour Correction (reference §6/§8.3). Mosaic quantises
// the sample coordinate; Nega inverts; Paint posterises; Mono greyscales. Linear in/out.

export const busEffectWGSL = /* wgsl */ `
struct Uniforms {
  resolution : vec2f,
  ccActive : f32,     // colour correction on
  ccJoystick : f32,   // RGB joystick active
  chroma : f32,       // 0..1, 0.5 = original, 0 = B&W
  joyX : f32,
  joyY : f32,
  nega : f32,
  mosaic : f32,
  mono : f32,
  paint : f32,
  mosaicSize : f32,   // 1..31
  paintLevel : f32,   // 0..1
  multiTiles : f32,   // 1 = off; 2/3/4 = Multi grid tiles per axis (reference §8.7)
  _p1 : f32,
  _p2 : f32,
};

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var tex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> u : Uniforms;

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

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  var uv = in.uv;

  // Multi tiles the frame into an N×N grid of copies (reference §8.7).
  if (u.multiTiles > 1.5) {
    uv = fract(uv * u.multiTiles);
  }

  // Mosaic quantises the sample coordinate: step 1 = fine, step 31 = coarse blocks.
  if (u.mosaic > 0.5) {
    let t = (u.mosaicSize - 1.0) / 30.0;
    let blocks = mix(140.0, 6.0, t);
    uv = (floor(in.uv * blocks) + 0.5) / blocks;
  }

  var col = textureSample(tex, samp, uv).rgb;

  // Colour Correction — unless Mono is on, which overrides it (reference §6/§8.3).
  if (u.ccActive > 0.5 && u.mono < 0.5) {
    let luma = dot(col, LUMA);
    let sat = u.chroma * 2.0; // 0.5 centre -> 1.0 (original), 0 -> B&W, 1 -> boosted
    col = mix(vec3f(luma), col, sat);

    if (u.ccJoystick > 0.5 && (u.joyX != 0.0 || u.joyY != 0.0)) {
      // Project the 2-D joystick onto R/G/B tint directions (120° apart).
      let tint = vec3f(
        u.joyX,
        u.joyX * -0.5 + u.joyY * 0.866,
        u.joyX * -0.5 + u.joyY * -0.866,
      );
      if (u.chroma < 0.001) {
        // Black & white -> a single mono tint toned toward the joystick colour.
        let tcol = normalize(max(tint, vec3f(0.0)) + vec3f(0.001));
        col = clamp(luma * (0.4 + 1.4 * tcol), vec3f(0.0), vec3f(1.0));
      } else {
        col = clamp(col + tint * 0.25, vec3f(0.0), vec3f(1.0));
      }
    }
  }

  // Nega: invert like a film negative (reference §8.1).
  if (u.nega > 0.5) {
    col = vec3f(1.0) - col;
  }

  // Paint: posterise into flat bands; MIN = finest, MAX = coarsest (reference §8.4).
  if (u.paint > 0.5) {
    let bands = mix(16.0, 3.0, u.paintLevel);
    col = floor(col * bands) / max(bands - 1.0, 1.0);
  }

  // Mono: greyscale, overriding Colour Correction (reference §8.3).
  if (u.mono > 0.5) {
    col = vec3f(dot(col, LUMA));
  }

  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;
