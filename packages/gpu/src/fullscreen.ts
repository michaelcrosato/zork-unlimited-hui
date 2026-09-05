import type { Gpu } from "./device.ts";
import { UniformBuffer } from "./uniforms.ts";

export interface FullscreenPassOptions {
  /** Fragment shader source exposing `@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f`. */
  code: string;
  /** Size of the `@group(0) @binding(0)` uniform struct in bytes. */
  uniformBytes: number;
  /** Number of `texture_2d<f32>` bindings, bound from `@binding(2)` upwards. */
  textures?: number;
  format?: GPUTextureFormat;
  blend?: GPUBlendState;
  sampler?: GPUSamplerDescriptor;
  label?: string;
  /** Match the render pass when drawing into a multisampled attachment. */
  sampleCount?: number;
  /** Match the render pass when it carries a depth attachment; the pass never writes depth. */
  depthFormat?: GPUTextureFormat;
}

const FULLSCREEN_VERTEX = /* wgsl */ `
struct FullscreenOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex
fn vs_fullscreen(@builtin(vertex_index) index: u32) -> FullscreenOut {
  let x = f32(i32(index & 1u) * 4 - 1);
  let y = f32(i32(index >> 1u) * 4 - 1);
  var out: FullscreenOut;
  out.position = vec4f(x, y, 0.0, 1.0);
  out.uv = vec2f((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}
`;

/**
 * One fragment shader over the whole target. The pass owns its uniform buffer
 * and a sampler; callers hand it texture views (in binding order) and draw.
 */
export class FullscreenPass {
  readonly uniforms: UniformBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly sampler: GPUSampler;
  private readonly textureCount: number;
  private bindGroup: GPUBindGroup | null = null;
  private boundViews: GPUTextureView[] = [];

  constructor(
    private readonly gpu: Gpu,
    options: FullscreenPassOptions,
  ) {
    const { device } = gpu;
    this.textureCount = options.textures ?? 0;
    this.uniforms = new UniformBuffer(device, options.uniformBytes, `${options.label ?? "fullscreen"} uniforms`);
    this.sampler = device.createSampler(
      options.sampler ?? { magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" },
    );
    const module = device.createShaderModule({ label: options.label, code: FULLSCREEN_VERTEX + options.code });
    this.pipeline = device.createRenderPipeline({
      label: options.label,
      layout: "auto",
      vertex: { module, entryPoint: "vs_fullscreen" },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{ format: options.format ?? gpu.format, ...(options.blend ? { blend: options.blend } : {}) }],
      },
      primitive: { topology: "triangle-list" },
      ...(options.sampleCount && options.sampleCount > 1 ? { multisample: { count: options.sampleCount } } : {}),
      ...(options.depthFormat ? { depthStencil: { format: options.depthFormat, depthWriteEnabled: false, depthCompare: "always" } } : {}),
    });
    if (this.textureCount === 0) this.bind([]);
  }

  /** Bind texture views in `@binding(2..)` order. Cheap when the views are unchanged. */
  bind(views: GPUTextureView[]): void {
    if (views.length !== this.textureCount) {
      throw new Error(`fullscreen pass expects ${this.textureCount} textures, got ${views.length}`);
    }
    if (this.bindGroup && views.every((view, i) => view === this.boundViews[i])) return;
    this.boundViews = views;
    const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: this.uniforms.buffer } }];
    if (this.textureCount > 0) entries.push({ binding: 1, resource: this.sampler });
    views.forEach((view, i) => entries.push({ binding: 2 + i, resource: view }));
    this.bindGroup = this.gpu.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries });
  }

  draw(pass: GPURenderPassEncoder): void {
    if (!this.bindGroup) throw new Error("fullscreen pass drawn before bind()");
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
  }
}
