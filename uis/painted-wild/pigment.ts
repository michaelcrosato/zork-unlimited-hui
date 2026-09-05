import { UniformBuffer, type Gpu, preprocessWgsl, WGSL_LIBS } from "@hui/gpu";
import shader from "./wgsl/pigment.wgsl?raw";

export class Pigment {
  private readonly textures: GPUTexture[];
  private readonly views: GPUTextureView[];
  private readonly uniforms: UniformBuffer;
  private readonly pipeline: GPUComputePipeline;
  private readonly groups: GPUBindGroup[];
  private front = 0;
  constructor(gpu: Gpu) {
    const { device } = gpu;
    this.textures = [0,1].map(i => device.createTexture({ label: `wet pigment ${i}`, size: [512,512], format: "rgba16float", usage: GPUTextureUsage.STORAGE_BINDING|GPUTextureUsage.TEXTURE_BINDING }));
    this.views = this.textures.map(t=>t.createView());
    this.uniforms = new UniformBuffer(device,64,"pigment advection");
    const module = device.createShaderModule({ code: preprocessWgsl(shader,WGSL_LIBS), label: "curl-advection paint" });
    this.pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "paint" } });
    const sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });
    this.groups = [0,1].map(i=>device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.uniforms.buffer } },{ binding: 1, resource: sampler },
      { binding: 2, resource: this.views[i]! },{ binding: 3, resource: this.views[1-i]! },
    ] }));
  }
  update(encoder: GPUCommandEncoder, params: number[]): void {
    this.uniforms.set(0,params).upload(); const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline); pass.setBindGroup(0,this.groups[this.front]!); pass.dispatchWorkgroups(64,64); pass.end(); this.front=1-this.front;
  }
  view(): GPUTextureView { return this.views[this.front]!; }
  destroy(): void { for (const t of this.textures) t.destroy(); this.uniforms.buffer.destroy(); }
}
