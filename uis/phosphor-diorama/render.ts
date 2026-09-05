import type { Scene } from "@hui/core";
import { ALPHA_BLEND, FullscreenPass, PingPong, TextAtlas, TextRenderer, WGSL_LIBS, preprocessWgsl, type GlyphStyle } from "@hui/gpu";
import { blockAt, composePage, type BlockKind, type Ink, type PageBlock, type PageModel, type UiContext, type UiInstance } from "@hui/shell";
import { sceneParams, type DioramaParams } from "./scene-params.ts";
import dioramaWgsl from "./wgsl/diorama.wgsl?raw";
import persistWgsl from "./wgsl/persist.wgsl?raw";
import thresholdWgsl from "./wgsl/bloom-threshold.wgsl?raw";
import blurWgsl from "./wgsl/bloom-blur.wgsl?raw";
import crtWgsl from "./wgsl/crt.wgsl?raw";

const HDR: GPUTextureFormat = "rgba16float";
const LDR: GPUTextureFormat = "rgba8unorm";
const FAMILY = '"Cascadia Mono", "Cascadia Code", Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace';

type Rgba = [number, number, number, number];

const GREEN: Rgba = [0.5, 1.0, 0.62, 1];
const AMBER: Rgba = [1.0, 0.72, 0.28, 1];
const CYAN: Rgba = [0.45, 0.9, 1.0, 1];
const DIM: Rgba = [0.3, 0.6, 0.4, 1];
const PHOSPHOR: Record<BlockKind, Rgba> = {
  kicker: CYAN,
  title: [0.85, 1.0, 0.9, 1],
  vitals: DIM,
  ending: AMBER,
  prose: GREEN,
  dialogue: [0.75, 0.95, 1.0, 1],
  result: [0.9, 0.95, 0.6, 1],
  pressure: AMBER,
  choice: AMBER,
  terms: DIM,
  note: DIM,
};
const HOVER: Rgba = [1, 1, 1, 1];
const DISABLED: Rgba = [0.3, 0.35, 0.3, 0.8];

export async function renderPhosphorDiorama(ctx: UiContext): Promise<UiInstance> {
  const { gpu, client, canvas } = ctx;
  const { device } = gpu;

  const atlases: Record<Ink, TextAtlas> = {
    body: new TextAtlas(device, { family: FAMILY, px: 48, padding: 8 }),
    display: new TextAtlas(device, { family: FAMILY, px: 48, padding: 8, weight: "700" }),
    italic: new TextAtlas(device, { family: FAMILY, px: 48, padding: 8, style: "italic" }),
  };
  const text: Record<Ink, TextRenderer> = {
    body: new TextRenderer(gpu, atlases.body, { format: LDR, capacity: 12000 }),
    display: new TextRenderer(gpu, atlases.display, { format: LDR, capacity: 5000 }),
    italic: new TextRenderer(gpu, atlases.italic, { format: LDR, capacity: 4000 }),
  };
  const measures = {
    body: (ch: string, size: number) => atlases.body.measure(ch, size),
    display: (ch: string, size: number) => atlases.display.measure(ch, size),
    italic: (ch: string, size: number) => atlases.italic.measure(ch, size),
  };

  const diorama = new FullscreenPass(gpu, { code: preprocessWgsl(dioramaWgsl, WGSL_LIBS), uniformBytes: 64, format: HDR, label: "diorama" });
  const persist = new FullscreenPass(gpu, { code: preprocessWgsl(persistWgsl, WGSL_LIBS), uniformBytes: 16, textures: 2, format: LDR, label: "persist" });
  const threshold = new FullscreenPass(gpu, { code: preprocessWgsl(thresholdWgsl, WGSL_LIBS), uniformBytes: 16, textures: 2, format: HDR, label: "bloom threshold" });
  const blur = new FullscreenPass(gpu, { code: preprocessWgsl(blurWgsl, WGSL_LIBS), uniformBytes: 16, textures: 1, format: HDR, label: "bloom blur" });
  const crt = new FullscreenPass(gpu, { code: preprocessWgsl(crtWgsl, WGSL_LIBS), uniformBytes: 32, textures: 3, label: "crt" });

  let dioramaTex: GPUTexture | null = null;
  let textTex: GPUTexture | null = null;
  let phosphor: PingPong | null = null;
  let bloom: PingPong | null = null;
  const ensureTargets = (): void => {
    const { width, height } = gpu.size();
    if (dioramaTex && dioramaTex.width === Math.ceil(width / 2) && textTex?.width === width && textTex.height === height) return;
    dioramaTex?.destroy();
    textTex?.destroy();
    dioramaTex = device.createTexture({
      label: "diorama",
      size: { width: Math.ceil(width / 2), height: Math.ceil(height / 2) },
      format: HDR,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    textTex = device.createTexture({ label: "terminal text", size: { width, height }, format: LDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    if (phosphor) phosphor.resize(width, height);
    else phosphor = new PingPong(device, LDR, width, height, "phosphor");
    const bw = Math.ceil(width / 4);
    const bh = Math.ceil(height / 4);
    if (bloom) bloom.resize(bw, bh);
    else bloom = new PingPong(device, HDR, bw, bh, "bloom");
  };

  let scene: Scene = client.scene();
  let params: DioramaParams = sceneParams(scene);
  let page: PageModel | null = null;
  let viewport = { width: 0, height: 0 };
  let column = { x: 0, width: 0 };
  let scrollY = 0;
  let hovered: string | null = null;
  let revealStart = 0;
  let now = 0;

  const compose = (): void => {
    const { cssWidth, cssHeight } = gpu.size();
    viewport = { width: cssWidth, height: cssHeight };
    const width = Math.min(720, Math.max(300, cssWidth * 0.56));
    column = { x: Math.max(28, cssWidth * 0.045), width };
    page = composePage(scene, viewport, measures.body, measures, { column, top: 64, typeScale: 0.88 });
    for (const block of page.blocks) atlases[block.ink].ensure(block.text);
    scrollY = Math.min(scrollY, Math.max(0, page.height - cssHeight));
  };
  canvas.addEventListener(
    "wheel",
    (event) => {
      if (!page) return;
      scrollY = Math.max(0, Math.min(Math.max(0, page.height - viewport.height), scrollY + event.deltaY));
      event.preventDefault();
    },
    { passive: false },
  );

  const applyScene = (next: Scene): void => {
    scene = next;
    params = sceneParams(scene);
    revealStart = now;
    scrollY = 0;
    hovered = null;
    compose();
  };
  applyScene(scene);

  const typing = (block: PageBlock, blockStart: number): ((glyph: { index: number }) => Partial<GlyphStyle>) => {
    return (glyph) => ({ t0: blockStart + glyph.index * 0.0035 });
  };

  return {
    onScene: applyScene,
    frame(_dt, time) {
      now = time;
      const size = gpu.size();
      if (!page || size.cssWidth !== viewport.width || size.cssHeight !== viewport.height) compose();
      ensureTargets();
      const textEdge = (column.x + column.width + 24) / size.cssWidth;
      const flicker = 0.965 + 0.035 * (0.5 + 0.5 * Math.sin(time * 37) * Math.sin(time * 11.3)) - params.glitch * 0.1 * Math.abs(Math.sin(time * 23));

      const encoder = device.createCommandEncoder({ label: "phosphor frame" });

      // 1. The room behind the glass, at half resolution.
      diorama.uniforms
        .set(0, [dioramaTex!.width, dioramaTex!.height, time, params.doors])
        .set(4, [params.enemyCount, params.npcCount, params.objects, params.phase])
        .set(8, [params.fog, params.sunAngle, params.night, params.glitch])
        .set(12, [params.warmth, params.danger, params.roomSeed, textEdge])
        .upload();
      const roomPass = encoder.beginRenderPass({
        label: "diorama",
        colorAttachments: [{ view: dioramaTex!.createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }],
      });
      diorama.draw(roomPass);
      roomPass.end();

      // 2. The terminal text, typed in.
      const textPass = encoder.beginRenderPass({
        label: "terminal text",
        colorAttachments: [{ view: textTex!.createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: "store" }],
      });
      for (const renderer of Object.values(text)) renderer.begin();
      let cumulative = 0;
      for (const block of page!.blocks) {
        const blockStart = revealStart + Math.min(2.0, cumulative * 0.0025 + block.order * 0.03);
        cumulative += block.layout.glyphs.length;
        const isHovered = block.actionId !== undefined && block.actionId === hovered && !block.disabled;
        const color = block.disabled ? DISABLED : isHovered ? HOVER : PHOSPHOR[block.kind];
        const style: GlyphStyle = { color, softness: 0.09, weight: block.kind === "title" || isHovered ? 0.05 : 0.02, wobble: params.glitch * 1.2 };
        text[block.ink].pushText(block.layout, block.x, block.y - scrollY, block.size, style, typing(block, blockStart));
      }
      for (const renderer of Object.values(text)) renderer.flush(textPass, time, [size.cssWidth, size.cssHeight]);
      textPass.end();

      // 3. Phosphor persistence: fresh text over the decayed previous frame.
      persist.uniforms.set(0, [0.9, 0, 0, 0]).upload();
      persist.bind([textTex!.createView(), phosphor!.readView()]);
      const persistPass = encoder.beginRenderPass({
        label: "persist",
        colorAttachments: [{ view: phosphor!.writeView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: "store" }],
      });
      persist.draw(persistPass);
      persistPass.end();
      phosphor!.swap();

      // 4. Bloom: bright pass then two blur directions at quarter resolution.
      threshold.uniforms.set(0, [0.8, 0.9, 1.4, 0]).upload();
      threshold.bind([phosphor!.readView(), dioramaTex!.createView()]);
      const thresholdPass = encoder.beginRenderPass({ label: "bloom threshold", colorAttachments: [{ view: bloom!.writeView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
      threshold.draw(thresholdPass);
      thresholdPass.end();
      bloom!.swap();
      const texel: [number, number] = [1 / bloom!.width, 1 / bloom!.height];
      for (const direction of [[1, 0], [0, 1]] as const) {
        blur.uniforms.set(0, [direction[0], direction[1], texel[0], texel[1]]).upload();
        blur.bind([bloom!.readView()]);
        const blurPass = encoder.beginRenderPass({ label: "bloom blur", colorAttachments: [{ view: bloom!.writeView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        blur.draw(blurPass);
        blurPass.end();
        bloom!.swap();
      }

      // 5. The glass.
      crt.uniforms.set(0, [size.cssWidth, size.cssHeight, time, params.glitch, params.night, params.danger, textEdge, flicker]).upload();
      crt.bind([dioramaTex!.createView(), phosphor!.readView(), bloom!.readView()]);
      const canvasPass = encoder.beginRenderPass({
        label: "crt",
        colorAttachments: [{ view: gpu.currentTexture().createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }],
      });
      crt.draw(canvasPass);
      canvasPass.end();
      device.queue.submit([encoder.finish()]);
    },
    hit(x, y) {
      if (!page) return null;
      const block = blockAt(page, x, y + scrollY);
      return block && !block.disabled ? (block.actionId ?? null) : null;
    },
    hover(x, y) {
      if (!page) return false;
      const block = blockAt(page, x, y + scrollY);
      hovered = block && !block.disabled ? (block.actionId ?? null) : null;
      return hovered !== null;
    },
    destroy() {
      dioramaTex?.destroy();
      textTex?.destroy();
      phosphor?.destroy();
      bloom?.destroy();
    },
  };
}

// Kept for parity with the other interfaces' blend imports; the text passes
// draw into a transparent target with straight alpha.
void ALPHA_BLEND;
