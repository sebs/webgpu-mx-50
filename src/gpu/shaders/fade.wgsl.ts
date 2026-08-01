// The Fade stage (reference §11, ADR-0004 `fade` stage): mixes the PRE-DSK composite
// toward the fade target by the VIDEO-element fade amount — a flat colour
// (matte/white/black) or the uneffected A/B bus texture. Linear light (ADR-0005). The DSK
// element fades separately, as key opacity inside the DSK pass (selective fading §11).
// The domain (core/fade.ts) decides the target + amount; this shader realises the pixels.

export const fadeWGSL = /* wgsl */ `
struct Uniforms {
  targetMode : f32,   // 0 = flat colour (matte/white/black), 1 = bus texture (A/B)
  amount : f32,       // video fade amount: 0 = composite, 1 = full target
  pad0 : f32,
  pad1 : f32,
  targetColour : vec4f, // rgb used when targetMode == 0
};

@group(0) @binding(0) var samp : sampler;
@group(0) @binding(1) var composite : texture_2d<f32>; // post-DSK
@group(0) @binding(2) var targetTex : texture_2d<f32>; // uneffected A/B bus (ignored when flat)
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
  let bus = textureSample(targetTex, samp, in.uv).rgb;
  // 'target' is a WGSL reserved word — hence 'goal'.
  let goal = select(bus, u.targetColour.rgb, u.targetMode < 0.5);
  return vec4f(mix(comp, goal, u.amount), 1.0);
}
`;
