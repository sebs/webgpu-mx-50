// The Downstream Key pass (reference §10): keys a title source over the finished
// composite. The key window (Low/High) over the key source's luminance defines the
// characters, filled with the DSK fill colour; REVERSE swaps character/background. The
// EDGE styles render in-shader from the same mask: borders are a dilated ring around the
// characters (multi-tap re-evaluation of the key window), shadows a darkened offset copy
// behind them (attached via a contact-edge extrusion), Drop Shadow a hard detached offset
// silhouette. White fill lets the edge take a matte colour (graded by GRADATION); a matte
// fill forces a black edge (core/dsk.ts). dskFade scales the whole key overlay toward the
// bare composite — the Fade stage's DSK element (reference §11 selective fading).

export const dskWGSL = /* wgsl */ `
struct Uniforms {
  on : f32,              // s0
  low : f32,             // s1
  high : f32,            // s2
  reverse : f32,         // s3
  fill : vec3f,          // s4..6  fill colour, linear (offset 16)
  edgeMode : f32,        // s7     0 none, 1 border, 2 shadow, 3 drop-shadow (DSK_EDGE_MODE)
  edgeColor : vec3f,     // s8..10 edge/shadow colour, linear (offset 32)
  borderWidth : f32,     // s11    ring radius, uv frame-height units
  shadowOffset : vec2f,  // s12..13 uv, +x right / +y down (offset 48)
  shadowOpacity : f32,   // s14    0.75 attached, 1.0 drop
  edgeGradation : f32,   // s15    >0.5 = grade edgeColor by uv.y (matte GRADATION ramp)
  aspectScale : f32,     // s16    height/width — circular rings/offsets in pixels (offset 64)
  dskFade : f32,         // s17    Fade §11 DSK element: 0 = key fully on, 1 = key invisible
  _pad : vec2f,          // s18..19 (offset 72; total 80)
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

fn keyMask(uv : vec2f) -> f32 {
  let luma = dot(textureSampleLevel(keyTex, samp, uv, 0.0).rgb, vec3f(0.299, 0.587, 0.114));
  let inWindow = luma >= u.low && luma <= u.high;
  var m = select(0.0, 1.0, inWindow);
  if (u.reverse > 0.5) { m = 1.0 - m; }
  return m;
}

// Mask dilation: two 8-tap rings (radius r and r*0.5, angles k*45°), 16 taps total.
// The half-radius ring stops thin diagonal strokes producing dotted borders.
fn dilatedMask(uv : vec2f, radius : f32) -> f32 {
  var m = 0.0;
  for (var i = 0u; i < 8u; i = i + 1u) {
    let a = f32(i) * 0.78539816; // 2π/8
    let d = vec2f(cos(a) * u.aspectScale, sin(a));
    m = max(m, keyMask(uv + d * radius));
    m = max(m, keyMask(uv + d * radius * 0.5));
  }
  return m;
}

// Shadow: a pixel is shadowed when a character sits at uv - offset. Narrow/Wide sample
// 3 taps along the offset (t = 1/3, 2/3, 1) so the silhouette is extruded from the glyph
// (contact edge); Drop Shadow samples only t = 1 (detached, hard).
fn shadowMask(uv : vec2f) -> f32 {
  let off = u.shadowOffset * vec2f(u.aspectScale, 1.0);
  if (u.edgeMode > 2.5) { return keyMask(uv - off); }
  var m = 0.0;
  for (var i = 1u; i <= 3u; i = i + 1u) {
    m = max(m, keyMask(uv - off * (f32(i) / 3.0)));
  }
  return m;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  let comp = textureSample(composite, samp, in.uv).rgb;
  if (u.on < 0.5) {
    return vec4f(comp, 1.0); // DSK off: pass the composite through unchanged
  }
  let ch = keyMask(in.uv);
  // GRADATION ramp: least intense at the top → full at the bottom (matte.wgsl convention).
  let grade = select(1.0, in.uv.y, u.edgeGradation > 0.5);
  let edgeCol = u.edgeColor * grade;
  var col = comp;
  if (u.edgeMode > 1.5) { // shadow / drop-shadow behind the characters
    let sh = shadowMask(in.uv) * (1.0 - ch);
    col = mix(col, edgeCol, sh * u.shadowOpacity);
  }
  if (u.edgeMode > 0.5 && u.edgeMode < 1.5) { // border ring = dilated minus character
    let ring = max(dilatedMask(in.uv, u.borderWidth) - ch, 0.0);
    col = mix(col, edgeCol, ring);
  }
  col = mix(col, u.fill, ch); // characters on top
  // Selective DSK fade (reference §11): scale the whole key overlay toward the composite.
  return vec4f(mix(comp, col, 1.0 - clamp(u.dskFade, 0.0, 1.0)), 1.0);
}
`;
