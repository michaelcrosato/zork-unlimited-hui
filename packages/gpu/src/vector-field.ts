import type { Gpu } from "./device.ts";
import { UniformBuffer } from "./uniforms.ts";
import { ALPHA_BLEND } from "./text/renderer.ts";
import { ADDITIVE_BLEND } from "./particles.ts";
import { preprocessWgsl } from "./wgsl/include.ts";
import { WGSL_LIBS } from "./wgsl/libs.ts";
import shader from "./vector-field.wgsl?raw";

/** A persistent compute buffer of directional brush marks or 3D-projected shards. */
export class VectorField {
  readonly count: number;
  readonly uniforms: UniformBuffer;
  private readonly buffer: GPUBuffer;
  private readonly updatePipeline: GPUComputePipeline;
  private readonly renderPipeline: GPURenderPipeline;
  private readonly updateGroup: GPUBindGroup;
  private readonly renderGroup: GPUBindGroup;

  constructor(gpu: Gpu, energy: boolean) {
    this.count = energy ? 262144 : 65536;
    const { device } = gpu;
    this.uniforms = new UniformBuffer(device,64,"flow field");
    this.buffer = device.createBuffer({ size: this.count*48, usage: GPUBufferUsage.STORAGE });
    const module = device.createShaderModule({ code: preprocessWgsl(shader,WGSL_LIBS), label: energy ? "262k warp shards" : "65k flowing brush marks" });
    this.updatePipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "update" } });
    this.renderPipeline = device.createRenderPipeline({ layout: "auto", vertex: { module, entryPoint: "vs" },
      fragment: { module, entryPoint: "fs", targets: [{ format: "rgba16float", blend: energy ? ADDITIVE_BLEND : ALPHA_BLEND }] }, primitive: { topology: "triangle-list" } });
    this.updateGroup = device.createBindGroup({ layout: this.updatePipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniforms.buffer } }, { binding: 1, resource: { buffer: this.buffer } },
    ] });
    this.renderGroup = device.createBindGroup({ layout: this.renderPipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniforms.buffer } }, { binding: 2, resource: { buffer: this.buffer } },
    ] });
  }
  update(encoder: GPUCommandEncoder, params: number[]): void {
    this.uniforms.set(0,params).upload();
    const pass = encoder.beginComputePass(); pass.setPipeline(this.updatePipeline); pass.setBindGroup(0,this.updateGroup); pass.dispatchWorkgroups(this.count/256); pass.end();
  }
  draw(pass: GPURenderPassEncoder): void { pass.setPipeline(this.renderPipeline); pass.setBindGroup(0,this.renderGroup); pass.draw(6,this.count); }
  destroy(): void { this.uniforms.buffer.destroy(); this.buffer.destroy(); }
}
