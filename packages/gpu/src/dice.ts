import type { Gpu } from "./device.ts";
import { diceMesh, faceOrientation, quatMultiply, type DiceMesh, type Quat } from "./dice-mesh.ts";
import { UniformBuffer } from "./uniforms.ts";
import shader from "./dice.wgsl?raw";

export interface DiePose { sides: 6 | 20; value: number; x: number; y: number; size: number; age: number; enemy: boolean }

export class DiceRenderer {
  private readonly pipeline: GPURenderPipeline;
  private readonly meshes = new Map<6 | 20, { mesh: DiceMesh; buffer: GPUBuffer }>();
  private readonly uniforms: UniformBuffer[];
  private readonly groups: GPUBindGroup[];
  private readonly numerals: GPUTexture;

  constructor(private readonly gpu: Gpu, private readonly energy: boolean) {
    const { device } = gpu;
    const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 384;
    const paint = canvas.getContext("2d")!;
    paint.font = energy ? '700 58px "Cascadia Mono", monospace' : '700 60px Georgia, serif';
    paint.textAlign = "center"; paint.textBaseline = "middle"; paint.fillStyle = "white";
    for (let i = 1; i <= 20; i++) paint.fillText(String(i), ((i - 1) % 5) * 96 + 48, Math.floor((i - 1) / 5) * 96 + 50);
    this.numerals = device.createTexture({ size: [480,384], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    device.queue.copyExternalImageToTexture({ source: canvas }, { texture: this.numerals }, [480,384]);
    for (const sides of [6,20] as const) {
      const mesh = diceMesh(sides);
      const buffer = device.createBuffer({ size: mesh.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(buffer, 0, mesh.vertices as Float32Array<ArrayBuffer>);
      this.meshes.set(sides, { mesh, buffer });
    }
    const module = device.createShaderModule({ code: shader, label: "physical d6 and d20" });
    this.pipeline = device.createRenderPipeline({ layout: "auto",
      vertex: { module, entryPoint: "vs", buffers: [{ arrayStride: 48, attributes: [
        { shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "float32x3" },
        { shaderLocation: 2, offset: 24, format: "float32x2" }, { shaderLocation: 3, offset: 32, format: "float32" },
        { shaderLocation: 4, offset: 36, format: "float32x3" },
      ] }] },
      fragment: { module, entryPoint: "fs", targets: [{ format: "rgba16float" }] },
      primitive: { topology: "triangle-list", cullMode: "back" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    });
    this.uniforms = [0,1].map(i => new UniformBuffer(device, 64, `die ${i}`));
    const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
    this.groups = this.uniforms.map(uniforms => device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: uniforms.buffer } }, { binding: 1, resource: sampler }, { binding: 2, resource: this.numerals.createView() },
    ] }));
  }

  draw(pass: GPURenderPassEncoder, poses: DiePose[]): void {
    const { cssWidth, cssHeight } = this.gpu.size();
    pass.setPipeline(this.pipeline);
    poses.slice(0, 2).forEach((pose, i) => {
      const item = this.meshes.get(pose.sides)!;
      const spin = Math.pow(Math.max(0, 1 - pose.age / 1.4), 2.5);
      const axis = (a: number, n: number): Quat => [n === 0 ? Math.sin(a) : 0, n === 1 ? Math.sin(a) : 0, n === 2 ? Math.sin(a) : 0, Math.cos(a)];
      const tilt:Quat=pose.sides===6 ? quatMultiply(axis(-0.09,0),axis(-0.10,1)) : [0,0,0,1];
      const q = quatMultiply(quatMultiply(axis(spin * 15, 0), axis(spin * 21, 1)), quatMultiply(tilt,faceOrientation(item.mesh, pose.value)));
      const bounce = pose.age < 1.4 ? Math.abs(Math.sin(pose.age * 13)) * Math.exp(-pose.age * 2) * pose.size * 0.7 : 0;
      this.uniforms[i]!.set(0, [cssWidth, cssHeight, pose.sides, this.energy ? 1 : 0, pose.x, pose.y - bounce, pose.size, pose.enemy ? 1 : 0,
        ...q, pose.age, pose.value, 0, 0]).upload();
      pass.setBindGroup(0, this.groups[i]!);
      pass.setVertexBuffer(0, item.buffer);
      pass.draw(item.mesh.vertices.length / 12);
    });
  }
  destroy(): void {
    this.numerals.destroy();
    for (const item of this.meshes.values()) item.buffer.destroy();
    for (const u of this.uniforms) u.buffer.destroy();
  }
}
