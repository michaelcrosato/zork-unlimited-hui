import type { Gpu } from "./device.ts";
import { UniformBuffer } from "./uniforms.ts";
import { ALPHA_BLEND } from "./text/renderer.ts";
import shader from "./shapes.wgsl?raw";

export type Rgba = [number, number, number, number];

/** Instanced, antialiased SDF panels, rules and circular instrument marks. */
export class ShapeRenderer {
  private readonly uniforms: UniformBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly group: GPUBindGroup;
  private readonly buffer: GPUBuffer;
  private readonly data = new Float32Array(2048 * 12);
  private count = 0;

  constructor(private readonly gpu: Gpu, format = gpu.format) {
    const { device } = gpu;
    this.uniforms = new UniformBuffer(device, 16, "shape viewport");
    this.buffer = device.createBuffer({ size: this.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const module = device.createShaderModule({ code: shader, label: "SDF instruments" });
    this.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs", buffers: [{ arrayStride: 48, stepMode: "instance", attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x4" },
        { shaderLocation: 1, offset: 16, format: "float32x4" },
        { shaderLocation: 2, offset: 32, format: "float32x4" },
      ] }] },
      fragment: { module, entryPoint: "fs", targets: [{ format, blend: ALPHA_BLEND }] },
      primitive: { topology: "triangle-list" },
    });
    this.group = device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.uniforms.buffer } }] });
  }

  begin(): void { this.count = 0; }

  rect(x: number, y: number, width: number, height: number, color: Rgba, radius = 0, stroke = 0, ellipse = false): void {
    if (width <= 0 || height <= 0 || this.count >= 2048) return;
    this.data.set([x, y, width, height, ...color, radius, stroke, ellipse ? 1 : 0, 0], this.count++ * 12);
  }

  circle(x: number, y: number, radius: number, color: Rgba, stroke = 0): void {
    this.rect(x - radius, y - radius, radius * 2, radius * 2, color, radius, stroke, true);
  }

  flush(pass: GPURenderPassEncoder): void {
    if (!this.count) return;
    const { cssWidth, cssHeight } = this.gpu.size();
    this.uniforms.set(0, [cssWidth, cssHeight, 0, 0]).upload();
    this.gpu.device.queue.writeBuffer(this.buffer, 0, this.data, 0, this.count * 12);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.group);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(6, this.count);
  }

  destroy(): void { this.buffer.destroy(); this.uniforms.buffer.destroy(); }
}
