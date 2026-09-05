import type { Gpu } from "./device.ts";
import { UniformBuffer } from "./uniforms.ts";
import { preprocessWgsl } from "./wgsl/include.ts";
import { WGSL_LIBS } from "./wgsl/libs.ts";
import particleShader from "./particles.wgsl?raw";

export interface ParticleParams {
  dt: number;
  time: number;
  gravity: [number, number];
  wind: [number, number];
  /** Emitter rectangle in CSS pixels: x, y, width, height. */
  emitter: [number, number, number, number];
  color: [number, number, number, number];
  /** Base radius in CSS pixels. */
  size: number;
  /** Mean lifetime in seconds. */
  life: number;
  turbulence: number;
  /** 0 snow, 1 embers, 2 motes. */
  mode: 0 | 1 | 2;
  /** Share of the pool allowed to be alive, 0..1. */
  density: number;
  drag: number;
  seed?: number;
}

const PARTICLE_STRIDE = 32;
const PARAMS_BYTES = 96;

export const ADDITIVE_BLEND: GPUBlendState = {
  color: { srcFactor: "src-alpha", dstFactor: "one", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
};

export const PREMULTIPLIED_OVER: GPUBlendState = {
  color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

/**
 * A GPU particle pool: one compute dispatch integrates every particle, one
 * instanced draw renders them. The whole state lives on the GPU; the CPU only
 * writes a small parameter block each frame.
 */
export class ParticleSystem {
  readonly params: UniformBuffer;
  private readonly buffer: GPUBuffer;
  private readonly computePipeline: GPUComputePipeline;
  private readonly renderPipeline: GPURenderPipeline;
  private readonly computeBindGroup: GPUBindGroup;
  private readonly renderBindGroup: GPUBindGroup;

  constructor(
    private readonly gpu: Gpu,
    readonly count: number,
    options: { format?: GPUTextureFormat; blend?: GPUBlendState; label?: string } = {},
  ) {
    const { device } = gpu;
    const label = options.label ?? "particles";
    this.params = new UniformBuffer(device, PARAMS_BYTES, `${label} params`);
    this.buffer = device.createBuffer({
      label: `${label} state`,
      size: count * PARTICLE_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const module = device.createShaderModule({ label, code: preprocessWgsl(particleShader, WGSL_LIBS) });
    this.computePipeline = device.createComputePipeline({
      label: `${label} update`,
      layout: "auto",
      compute: { module, entryPoint: "update" },
    });
    this.renderPipeline = device.createRenderPipeline({
      label: `${label} draw`,
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{ format: options.format ?? gpu.format, blend: options.blend ?? PREMULTIPLIED_OVER }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.computeBindGroup = device.createBindGroup({
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params.buffer } },
        { binding: 1, resource: { buffer: this.buffer } },
      ],
    });
    this.renderBindGroup = device.createBindGroup({
      layout: this.renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.params.buffer } },
        { binding: 2, resource: { buffer: this.buffer } },
      ],
    });
  }

  /** Write parameters and dispatch the integration step. */
  update(encoder: GPUCommandEncoder, viewportCss: [number, number], params: ParticleParams): void {
    const f = this.params.f32;
    f[0] = viewportCss[0];
    f[1] = viewportCss[1];
    f[2] = params.time;
    f[3] = params.dt;
    f[4] = params.gravity[0];
    f[5] = params.gravity[1];
    f[6] = params.wind[0];
    f[7] = params.wind[1];
    f.set(params.emitter, 8);
    f.set(params.color, 12);
    f[16] = params.size;
    f[17] = params.life;
    f[18] = params.turbulence;
    f[19] = params.mode;
    f[20] = params.density;
    f[21] = params.drag;
    f[22] = params.seed ?? 0;
    f[23] = 0;
    this.params.upload();
    const pass = encoder.beginComputePass({ label: "particles update" });
    pass.setPipeline(this.computePipeline);
    pass.setBindGroup(0, this.computeBindGroup);
    pass.dispatchWorkgroups(Math.ceil(this.count / 256));
    pass.end();
  }

  draw(pass: GPURenderPassEncoder): void {
    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBindGroup);
    pass.draw(6, this.count);
  }
}
