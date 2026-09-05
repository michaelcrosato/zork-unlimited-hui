import type { Gpu } from "./device.ts";
import { FullscreenPass } from "./fullscreen.ts";
import { preprocessWgsl } from "./wgsl/include.ts";
import { WGSL_LIBS } from "./wgsl/libs.ts";
import composite from "./cinematic.wgsl?raw";

const copy = `struct U { size: vec4f }; @group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var s: sampler; @group(0) @binding(2) var t: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f { return textureSample(t,s,clamp(uv,0.5/u.size.xy,1.0-0.5/u.size.xy)); }`;
const threshold = `struct U { data: vec4f }; @group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var s: sampler; @group(0) @binding(2) var t: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
let c = textureSample(t,s,uv).rgb; let l = max(c.r,max(c.g,c.b)); return vec4f(c * max(0.0,l-u.data.x)/max(l,0.001),1); }`;
const blur = `struct U { step: vec2f, pad: vec2f }; @group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var s: sampler; @group(0) @binding(2) var t: texture_2d<f32>;
@fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
var c = textureSample(t,s,uv) * 0.227027;
c += (textureSample(t,s,uv+u.step*1.384615)+textureSample(t,s,uv-u.step*1.384615))*0.316216;
c += (textureSample(t,s,uv+u.step*3.230769)+textureSample(t,s,uv-u.step*3.230769))*0.070270;
return c; }`;

/** Half-resolution artwork, full-resolution type/dice, HDR bloom and history. */
export class CinematicPipeline {
  private readonly upscale: FullscreenPass;
  private readonly threshold: FullscreenPass;
  private readonly blurX: FullscreenPass;
  private readonly blurY: FullscreenPass;
  readonly composite: FullscreenPass;
  private textures: GPUTexture[] = [];
  private views: GPUTextureView[] = [];
  private depth!: GPUTextureView;
  private width = 0;
  private height = 0;
  private capture = false;
  private hasFrame = false;
  private hasHistory = false;

  constructor(private readonly gpu: Gpu) {
    const hdr = { format: "rgba16float" as GPUTextureFormat, uniformBytes: 16, textures: 1 };
    this.upscale = new FullscreenPass(gpu, { ...hdr, code: copy, label: "artwork upscale" });
    this.threshold = new FullscreenPass(gpu, { ...hdr, code: threshold, label: "HDR light extraction" });
    this.blurX = new FullscreenPass(gpu, { ...hdr, code: blur, label: "bloom horizontal" });
    this.blurY = new FullscreenPass(gpu, { ...hdr, code: blur, label: "bloom vertical" });
    this.composite = new FullscreenPass(gpu, { code: preprocessWgsl(composite, WGSL_LIBS), textures: 3, uniformBytes: 64, label: "cinematic scene composite" });
  }

  transition(): void { this.capture = true; }

  private ensure(): void {
    const { width, height } = this.gpu.size();
    if (width === this.width && height === this.height) return;
    for (const texture of this.textures) texture.destroy();
    this.width = width; this.height = height; this.hasFrame = false; this.hasHistory = false;
    const make = (label: string, scale: number, format: GPUTextureFormat, usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING) => this.gpu.device.createTexture({ label, size: [Math.max(1,Math.ceil(width*scale)),Math.max(1,Math.ceil(height*scale))], format, usage });
    this.textures = [make("HDR artwork",0.5,"rgba16float"), make("HDR scene and text",1,"rgba16float"),
      make("bloom 0",0.25,"rgba16float"),make("bloom 1",0.25,"rgba16float"),make("bloom 2",0.25,"rgba16float"),
      make("last complete frame",1,this.gpu.format,GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING),
      make("transition history",1,this.gpu.format,GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING),
      make("dice depth",1,"depth24plus",GPUTextureUsage.RENDER_ATTACHMENT)];
    this.views = this.textures.map(t => t.createView()); this.depth = this.views[7]!;
    this.upscale.bind([this.views[0]!]); this.threshold.bind([this.views[1]!]);
    this.blurX.bind([this.views[2]!]); this.blurY.bind([this.views[3]!]);
    this.composite.bind([this.views[1]!,this.views[4]!,this.views[6]!]);
  }

  beginArtwork(encoder: GPUCommandEncoder): GPURenderPassEncoder {
    this.ensure();
    if (this.capture && this.hasFrame) {
      encoder.copyTextureToTexture({ texture: this.textures[5]! }, { texture: this.textures[6]! }, [this.width,this.height]);
      this.hasHistory = true;
    }
    this.capture = false;
    return encoder.beginRenderPass({ label: "HDR art", colorAttachments: [{ view: this.views[0]!, loadOp: "clear", storeOp: "store" }] });
  }

  beginScene(encoder: GPUCommandEncoder): GPURenderPassEncoder {
    const pass = encoder.beginRenderPass({ label: "full resolution typography", colorAttachments: [{ view: this.views[1]!, loadOp: "clear", storeOp: "store" }] });
    this.upscale.uniforms.set(0,[this.width,this.height,0,0]).upload(); this.upscale.draw(pass);
    return pass;
  }

  beginDice(encoder: GPUCommandEncoder): GPURenderPassEncoder {
    return encoder.beginRenderPass({ label: "3D dice", colorAttachments: [{ view: this.views[1]!, loadOp: "load", storeOp: "store" }],
      depthStencilAttachment: { view: this.depth, depthLoadOp: "clear", depthClearValue: 1, depthStoreOp: "discard" } });
  }

  finish(encoder: GPUCommandEncoder, params: number[]): void {
    this.threshold.uniforms.set(0,[params[3] === 1 ? 0.8 : 1.05,0,0,0]).upload();
    this.blurX.uniforms.set(0,[1/this.textures[2]!.width,0,0,0]).upload();
    this.blurY.uniforms.set(0,[0,1/this.textures[2]!.height,0,0]).upload();
    for (const [effect, view] of [[this.threshold,this.views[2]!],[this.blurX,this.views[3]!],[this.blurY,this.views[4]!]] as const) {
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: "clear", storeOp: "store" }] }); effect.draw(pass); pass.end();
    }
    if (!this.hasHistory) params[4] = 1;
    this.composite.uniforms.set(0,params).upload();
    const texture = this.gpu.currentTexture();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: texture.createView(), loadOp: "clear", storeOp: "store" }] });
    this.composite.draw(pass); pass.end();
    encoder.copyTextureToTexture({ texture }, { texture: this.textures[5]! }, [this.width,this.height]);
    this.hasFrame = true;
  }

  destroy(): void {
    for (const texture of this.textures) texture.destroy();
    for (const effect of [this.upscale,this.threshold,this.blurX,this.blurY,this.composite]) effect.uniforms.buffer.destroy();
  }
}
