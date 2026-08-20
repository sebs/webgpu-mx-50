// Shader-generated demo feeds (presentation-side, like the 2D patterns in demo-feeds.ts):
// small WGSL fragment shaders rendered into a WebGPU canvas whose captureStream feeds the
// slot's HTMLVideoElement — so downstream everything is the ordinary ADR-0008 video path
// (VideoSource imports presented frames; the monitor preview is the same picture for free).
// One GPU device is shared by all shader feeds; each feed owns a runner (canvas + pipelines).
//
// Draws on wall-clock time like the patterns — never the logical clock (ADR-0012).

/** The selectable shaders, in Shader-button cycle order. */
export const FEED_SHADERS = ['plasma', 'tunnel', 'waves'] as const;
export type FeedShaderName = (typeof FEED_SHADERS)[number];

/** The next shader in the cycle (null → the first). Pure; unit-tested. */
export function nextShader(current: FeedShaderName | null): FeedShaderName {
  const index = current === null ? -1 : FEED_SHADERS.indexOf(current);
  return FEED_SHADERS[(index + 1) % FEED_SHADERS.length]!;
}

const COMMON = /* wgsl */ `
struct U { t: f32, w: f32, h: f32, pad: f32 }
@group(0) @binding(0) var<uniform> u: U;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}
`;

const FRAGMENTS: { [name in FeedShaderName]: string } = {
  // Classic sine-field plasma, full-palette.
  plasma: /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / vec2f(u.w, u.h);
  let t = u.t;
  var v = sin(uv.x * 10.0 + t);
  v = v + sin(uv.y * 8.0 - t * 1.3);
  v = v + sin((uv.x + uv.y) * 6.0 + t * 0.7);
  v = v + sin(length(uv - vec2f(0.5, 0.5)) * 14.0 - t * 2.0);
  let ph = v * 1.2;
  let c = vec3f(0.5 + 0.5 * sin(ph + t * 0.2), 0.5 + 0.5 * sin(ph + 2.094), 0.5 + 0.5 * sin(ph + 4.188));
  return vec4f(c, 1.0);
}
`,
  // Checkerboard fly-through tunnel with a centre falloff.
  tunnel: /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let p = (pos.xy - vec2f(u.w, u.h) * 0.5) / u.h;
  let r = max(length(p), 0.001);
  let a = atan2(p.y, p.x);
  let depth = 0.25 / r + u.t * 1.2;
  let checker = f32((i32(floor(depth * 4.0)) + i32(floor(a * 2.546479))) & 1);
  let shade = clamp(r * 2.4, 0.0, 1.0);
  let c = vec3f(1.0, 0.62, 0.3) * (0.2 + 0.8 * checker) * shade;
  return vec4f(c, 1.0);
}
`,
  // Teal interference waves with a soft scanline shimmer.
  waves: /* wgsl */ `
@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / vec2f(u.w, u.h);
  let t = u.t;
  var v = sin(uv.x * 24.0 + t * 2.0) * 0.5 + 0.5;
  v = v * (sin(uv.y * 14.0 - t * 1.1) * 0.5 + 0.5);
  let scan = sin(uv.y * u.h * 3.14159) * 0.05;
  let c = vec3f(0.05, v * 0.85 + scan, v * 0.65 + 0.2);
  return vec4f(c, 1.0);
}
`,
};

/** One shared device for every shader feed on the page. */
let sharedDevice: Promise<GPUDevice> | null = null;

function acquireDevice(): Promise<GPUDevice> {
  if (!sharedDevice) {
    sharedDevice = (async () => {
      if (!navigator.gpu) throw new Error('WebGPU is unavailable for shader feeds.');
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter for shader feeds.');
      return adapter.requestDevice();
    })();
    // A failed acquisition must not poison later attempts (e.g. adapter loss).
    sharedDevice.catch(() => {
      sharedDevice = null;
    });
  }
  return sharedDevice;
}

export class FeedShaderRunner {
  private active: FeedShaderName = FEED_SHADERS[0];

  private constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly uniform: GPUBuffer,
    private readonly bindGroup: GPUBindGroup,
    private readonly pipelines: Map<FeedShaderName, GPURenderPipeline>,
  ) {}

  /** Build a runner (shared device, own canvas + three tiny pipelines). Throws without WebGPU. */
  static async create(width: number, height: number): Promise<FeedShaderRunner> {
    const device = await acquireDevice();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU canvas context is unavailable for shader feeds.');
    const format = navigator.gpu!.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    const uniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // One EXPLICIT layout shared by all three pipelines — 'auto' layouts would make the
    // bind group pipeline-specific, and the Shader button swaps pipelines at will.
    const bgl = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [bgl] });
    const pipelines = new Map<FeedShaderName, GPURenderPipeline>();
    for (const name of FEED_SHADERS) {
      const module = device.createShaderModule({ code: COMMON + FRAGMENTS[name] });
      pipelines.set(name, device.createRenderPipeline({
        layout,
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
      }));
    }
    const bindGroup = device.createBindGroup({
      layout: bgl,
      entries: [{ binding: 0, resource: { buffer: uniform } }],
    });
    return new FeedShaderRunner(canvas, device, context, uniform, bindGroup, pipelines);
  }

  use(name: FeedShaderName): void {
    this.active = name;
  }

  /** Render one frame at wall-clock `t` seconds into the capture canvas. */
  render(t: number): void {
    const pipeline = this.pipelines.get(this.active);
    if (!pipeline) return;
    this.device.queue.writeBuffer(this.uniform, 0, new Float32Array([t, this.canvas.width, this.canvas.height, 0]));
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        storeOp: 'store',
      }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}
