import type { Gpu } from "../device.ts";
import { UniformBuffer } from "../uniforms.ts";
import type { TextAtlas } from "./atlas.ts";
import type { GlyphPlacement, TextLayout } from "./layout.ts";
import textShader from "./text.wgsl?raw";

export interface GlyphStyle {
  color: [number, number, number, number];
  /** Birth time in seconds; the glyph resolves from a blot over ~0.35 s after it. */
  t0?: number;
  /** Tremble amplitude in CSS pixels. */
  wobble?: number;
  /** Positive values thicken strokes (0..0.15 is sensible). */
  weight?: number;
  /** Edge softness in SDF units; ~0.08 at reading sizes. */
  softness?: number;
}

export interface TextRendererOptions {
  format?: GPUTextureFormat;
  /** Maximum glyph instances per flush. */
  capacity?: number;
  blend?: GPUBlendState;
}

const FLOATS_PER_GLYPH = 16;

export const ALPHA_BLEND: GPUBlendState = {
  color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

/**
 * Batches SDF glyph quads and draws them in one instanced call. Positions are
 * in CSS pixels of the target; the uniform viewport converts to clip space.
 */
export class TextRenderer {
  readonly uniforms: UniformBuffer;
  private readonly pipeline: GPURenderPipeline;
  private readonly instances: Float32Array<ArrayBuffer>;
  private readonly instanceBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;
  private atlasView: GPUTextureView;
  private count = 0;
  readonly capacity: number;

  constructor(
    private readonly gpu: Gpu,
    readonly atlas: TextAtlas,
    options: TextRendererOptions = {},
  ) {
    const { device } = gpu;
    this.capacity = options.capacity ?? 8192;
    this.instances = new Float32Array(this.capacity * FLOATS_PER_GLYPH);
    this.instanceBuffer = device.createBuffer({
      label: "text instances",
      size: this.instances.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.uniforms = new UniformBuffer(device, 16, "text uniforms");
    const module = device.createShaderModule({ label: "sdf text", code: textShader });
    this.pipeline = device.createRenderPipeline({
      label: "sdf text",
      layout: "auto",
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          {
            arrayStride: FLOATS_PER_GLYPH * 4,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x4" },
              { shaderLocation: 1, offset: 16, format: "float32x4" },
              { shaderLocation: 2, offset: 32, format: "float32x4" },
              { shaderLocation: 3, offset: 48, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{ format: options.format ?? gpu.format, blend: options.blend ?? ALPHA_BLEND }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.atlasView = atlas.view();
    this.bindGroup = this.makeBindGroup();
  }

  private makeBindGroup(): GPUBindGroup {
    return this.gpu.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms.buffer } },
        { binding: 1, resource: this.atlasView },
        { binding: 2, resource: this.atlas.sampler },
      ],
    });
  }

  begin(): void {
    this.count = 0;
  }

  get glyphCount(): number {
    return this.count;
  }

  /**
   * Queue a laid-out block at (x, y) in CSS pixels. `size` must match the size
   * the layout was measured with. `perGlyph` may override style per glyph, for
   * staggered reveals and highlights.
   */
  pushText(
    layout: TextLayout,
    x: number,
    y: number,
    size: number,
    style: GlyphStyle,
    perGlyph?: (glyph: GlyphPlacement) => Partial<GlyphStyle> | undefined,
  ): void {
    const scale = size / this.atlas.px;
    const baselineOffset = size * 0.8;
    for (const glyph of layout.glyphs) {
      if (this.count >= this.capacity) return;
      const info = this.atlas.glyph(glyph.ch);
      if (info.cellWidth === 0) continue;
      const override = perGlyph?.(glyph);
      const color = override?.color ?? style.color;
      const base = this.count * FLOATS_PER_GLYPH;
      const penX = x + glyph.x;
      const baseline = y + glyph.y + baselineOffset;
      this.instances[base] = penX + info.offsetX * scale;
      this.instances[base + 1] = baseline + info.offsetY * scale;
      this.instances[base + 2] = info.cellWidth * scale;
      this.instances[base + 3] = info.cellHeight * scale;
      this.instances[base + 4] = info.u0;
      this.instances[base + 5] = info.v0;
      this.instances[base + 6] = info.u1;
      this.instances[base + 7] = info.v1;
      this.instances[base + 8] = color[0];
      this.instances[base + 9] = color[1];
      this.instances[base + 10] = color[2];
      this.instances[base + 11] = color[3];
      this.instances[base + 12] = override?.t0 ?? style.t0 ?? -10;
      this.instances[base + 13] = override?.wobble ?? style.wobble ?? 0;
      this.instances[base + 14] = override?.weight ?? style.weight ?? 0;
      this.instances[base + 15] = override?.softness ?? style.softness ?? 0.08;
      this.count++;
    }
  }

  /** Upload queued glyphs and draw them into an open render pass. */
  flush(pass: GPURenderPassEncoder, time: number, viewportCss: [number, number]): void {
    if (this.count === 0) return;
    const { device } = this.gpu;
    this.uniforms.set(0, [viewportCss[0], viewportCss[1], time, this.atlas.padding]).upload();
    device.queue.writeBuffer(this.instanceBuffer, 0, this.instances, 0, this.count * FLOATS_PER_GLYPH);
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.instanceBuffer);
    pass.draw(6, this.count);
  }
}
