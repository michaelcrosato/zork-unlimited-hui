import { UniformBuffer, type Gpu } from "@hui/gpu";
import shader from "./wgsl/waves.wgsl?raw";

/** Height and velocity stay in two half-float storage textures on the GPU. */
export class WaveTank {
  readonly textures: GPUTexture[];
  readonly views: GPUTextureView[];
  private readonly uniforms: UniformBuffer;
  private readonly pipeline: GPUComputePipeline;
  private readonly groups: GPUBindGroup[];
  private front = 0;

  constructor(gpu: Gpu) {
    const { device } = gpu;
    this.uniforms = new UniformBuffer(device, 32, "water integration");
    this.textures = [0, 1].map(i => device.createTexture({ label: `water state ${i}`, size: [256, 256], format: "rgba16float", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING }));
    this.views = this.textures.map(t => t.createView());
    const module = device.createShaderModule({ code: shader, label: "finite difference water" });
    this.pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "step" } });
    this.groups = [0, 1].map(i => device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniforms.buffer } },
      { binding: 1, resource: this.views[i]! },
      { binding: 2, resource: this.views[1 - i]! },
    ] }));
  }

  step(encoder: GPUCommandEncoder, dt: number, time: number, danger: number, pulse: number, pointer: [number, number, number]): void {
    this.uniforms.set(0, [Math.min(1.5, Math.max(0, dt * 60)), time, danger, pulse, ...pointer, 0]).upload();
    const pass = encoder.beginComputePass({ label: "water integration" });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.groups[this.front]!);
    pass.dispatchWorkgroups(32, 32);
    pass.end();
    this.front = 1 - this.front;
  }

  view(): GPUTextureView { return this.views[this.front]!; }
  destroy(): void { for (const texture of this.textures) texture.destroy(); this.uniforms.buffer.destroy(); }
}
