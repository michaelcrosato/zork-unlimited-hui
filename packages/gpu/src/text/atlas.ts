import { buildSdfFromAlpha } from "./sdf.ts";

export interface GlyphInfo {
  /** Atlas texture coordinates of the padded glyph cell. */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  /** Cell size in atlas pixels (glyph box plus padding on every side). */
  cellWidth: number;
  cellHeight: number;
  /** Cell origin relative to the pen position, in atlas pixels; y grows downward. */
  offsetX: number;
  offsetY: number;
  /** Horizontal advance in atlas pixels. */
  advance: number;
}

export interface TextAtlasOptions {
  /** CSS font family list. */
  family: string;
  /** Rasterization size in pixels; glyphs scale from here via the SDF. */
  px?: number;
  /** SDF spread in pixels; also the padding around every glyph. */
  padding?: number;
  /** Square atlas edge in pixels. */
  size?: number;
  weight?: string;
  style?: string;
}

type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeContext(width: number, height: number): Canvas2D {
  if (typeof OffscreenCanvas === "function") {
    const ctx = new OffscreenCanvas(width, height).getContext("2d", { willReadFrequently: true });
    if (ctx) return ctx;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas is unavailable for glyph rasterization");
  return ctx;
}

/**
 * Lazily rasterizes glyphs with Canvas2D, converts each to a signed distance
 * field, and shelf-packs them into one r8unorm texture that every text
 * renderer samples. Shared across an interface so fonts load once.
 */
export class TextAtlas {
  readonly texture: GPUTexture;
  readonly sampler: GPUSampler;
  readonly px: number;
  readonly padding: number;
  readonly size: number;
  private readonly glyphs = new Map<string, GlyphInfo>();
  private readonly ctx: Canvas2D;
  private readonly font: string;
  private shelfX = 0;
  private shelfY = 0;
  private shelfHeight = 0;
  private readonly fallback: GlyphInfo;

  constructor(
    private readonly device: GPUDevice,
    options: TextAtlasOptions,
  ) {
    this.px = options.px ?? 48;
    this.padding = options.padding ?? 8;
    this.size = options.size ?? 2048;
    this.font = `${options.style ?? "normal"} ${options.weight ?? "400"} ${this.px}px ${options.family}`;
    this.texture = device.createTexture({
      label: `text atlas ${options.family}`,
      size: { width: this.size, height: this.size },
      format: "r8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const cell = this.px * 2 + this.padding * 4;
    this.ctx = makeContext(cell, cell);
    this.fallback = { u0: 0, v0: 0, u1: 0, v1: 0, cellWidth: 0, cellHeight: 0, offsetX: 0, offsetY: 0, advance: this.px * 0.5 };
  }

  view(): GPUTextureView {
    return this.texture.createView();
  }

  /** Rasterize any glyph in `text` that the atlas does not hold yet. */
  ensure(text: string): void {
    for (const ch of text) {
      if (ch === "\n" || this.glyphs.has(ch)) continue;
      this.rasterize(ch);
    }
  }

  glyph(ch: string): GlyphInfo {
    const found = this.glyphs.get(ch);
    if (found) return found;
    this.rasterize(ch);
    return this.glyphs.get(ch) ?? this.fallback;
  }

  /** Advance width of `ch` when drawn at `size` CSS pixels. */
  measure(ch: string, size: number): number {
    return (this.glyph(ch).advance * size) / this.px;
  }

  private rasterize(ch: string): void {
    const ctx = this.ctx;
    const pad = this.padding;
    ctx.font = this.font;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const metrics = ctx.measureText(ch);
    const left = Math.ceil(metrics.actualBoundingBoxLeft);
    const right = Math.ceil(metrics.actualBoundingBoxRight);
    const ascent = Math.ceil(metrics.actualBoundingBoxAscent);
    const descent = Math.ceil(metrics.actualBoundingBoxDescent);
    const glyphWidth = Math.max(0, left + right);
    const glyphHeight = Math.max(0, ascent + descent);
    const advance = metrics.width;
    if (glyphWidth === 0 || glyphHeight === 0 || /\s/.test(ch)) {
      this.glyphs.set(ch, { ...this.fallback, advance });
      return;
    }
    const cellWidth = glyphWidth + pad * 2;
    const cellHeight = glyphHeight + pad * 2;
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    if (cellWidth > canvasWidth || cellHeight > canvasHeight) {
      this.glyphs.set(ch, { ...this.fallback, advance });
      return;
    }
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = "#fff";
    ctx.fillText(ch, pad + left, pad + ascent);
    const image = ctx.getImageData(0, 0, cellWidth, cellHeight);
    const alpha = new Uint8Array(cellWidth * cellHeight);
    for (let i = 0; i < alpha.length; i++) alpha[i] = image.data[i * 4 + 3]!;
    const sdf = buildSdfFromAlpha(alpha, cellWidth, cellHeight, pad);

    if (this.shelfX + cellWidth > this.size) {
      this.shelfX = 0;
      this.shelfY += this.shelfHeight;
      this.shelfHeight = 0;
    }
    if (this.shelfY + cellHeight > this.size) {
      console.warn(`text atlas full; "${ch}" will render as a box`);
      this.glyphs.set(ch, { ...this.fallback, advance });
      return;
    }
    const x = this.shelfX;
    const y = this.shelfY;
    this.shelfX += cellWidth;
    this.shelfHeight = Math.max(this.shelfHeight, cellHeight);
    this.device.queue.writeTexture(
      { texture: this.texture, origin: { x, y } },
      sdf,
      { bytesPerRow: cellWidth },
      { width: cellWidth, height: cellHeight },
    );
    this.glyphs.set(ch, {
      u0: x / this.size,
      v0: y / this.size,
      u1: (x + cellWidth) / this.size,
      v1: (y + cellHeight) / this.size,
      cellWidth,
      cellHeight,
      offsetX: -left - pad,
      offsetY: -ascent - pad,
      advance,
    });
  }
}
