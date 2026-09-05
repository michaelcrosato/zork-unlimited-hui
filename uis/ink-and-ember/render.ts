import type { Scene } from "@hui/core";
import {
  ADDITIVE_BLEND,
  FullscreenPass,
  ParticleSystem,
  PREMULTIPLIED_OVER,
  TextAtlas,
  TextRenderer,
  WGSL_LIBS,
  preprocessWgsl,
  type GlyphStyle,
} from "@hui/gpu";
import type { UiContext, UiInstance } from "@hui/shell";
import { effectsFor, type InkEffects } from "./effects.ts";
import { blockAt, composePage, type BlockKind, type Ink, type PageBlock, type PageModel } from "@hui/shell";
import parchmentWgsl from "./wgsl/parchment.wgsl?raw";
import inkPostWgsl from "./wgsl/ink-post.wgsl?raw";

const OFFSCREEN: GPUTextureFormat = "rgba8unorm";
const FAMILY = 'Georgia, "Palatino Linotype", "Book Antiqua", "Times New Roman", serif';

type Rgba = [number, number, number, number];

const INKS: Record<BlockKind, Rgba> = {
  kicker: [0.6, 0.16, 0.12, 1],
  title: [0.14, 0.1, 0.08, 1],
  vitals: [0.42, 0.36, 0.3, 1],
  ending: [0.55, 0.14, 0.1, 1],
  prose: [0.17, 0.13, 0.1, 1],
  dialogue: [0.26, 0.18, 0.12, 1],
  result: [0.38, 0.23, 0.1, 1],
  pressure: [0.45, 0.27, 0.12, 1],
  choice: [0.66, 0.17, 0.12, 1],
  terms: [0.4, 0.34, 0.28, 1],
  note: [0.44, 0.38, 0.32, 1],
};
const HOVER: Rgba = [0.88, 0.26, 0.14, 1];
const DISABLED: Rgba = [0.6, 0.55, 0.5, 0.75];

export async function renderInkAndEmber(ctx: UiContext): Promise<UiInstance> {
  const { gpu, canvas, client } = ctx;
  const { device } = gpu;

  const atlases: Record<Ink, TextAtlas> = {
    body: new TextAtlas(device, { family: FAMILY, px: 48, padding: 8 }),
    display: new TextAtlas(device, { family: FAMILY, px: 48, padding: 8, weight: "700" }),
    italic: new TextAtlas(device, { family: FAMILY, px: 48, padding: 8, style: "italic" }),
  };
  const renderers: Record<Ink, TextRenderer> = {
    body: new TextRenderer(gpu, atlases.body, { format: OFFSCREEN, capacity: 12000 }),
    display: new TextRenderer(gpu, atlases.display, { format: OFFSCREEN, capacity: 4000 }),
    italic: new TextRenderer(gpu, atlases.italic, { format: OFFSCREEN, capacity: 4000 }),
  };
  const measures = {
    body: (ch: string, size: number) => atlases.body.measure(ch, size),
    display: (ch: string, size: number) => atlases.display.measure(ch, size),
    italic: (ch: string, size: number) => atlases.italic.measure(ch, size),
  };

  const parchment = new FullscreenPass(gpu, {
    code: preprocessWgsl(parchmentWgsl, WGSL_LIBS),
    uniformBytes: 32,
    format: OFFSCREEN,
    label: "parchment",
  });
  const post = new FullscreenPass(gpu, {
    code: preprocessWgsl(inkPostWgsl, WGSL_LIBS),
    uniformBytes: 32,
    textures: 1,
    label: "ink post",
  });
  const snow = new ParticleSystem(gpu, 60_000, { format: OFFSCREEN, blend: PREMULTIPLIED_OVER, label: "snow" });
  const embers = new ParticleSystem(gpu, 60_000, { format: OFFSCREEN, blend: ADDITIVE_BLEND, label: "embers" });

  let sceneTexture: GPUTexture | null = null;
  let sceneView: GPUTextureView | null = null;
  const ensureTarget = (): GPUTextureView => {
    const { width, height } = gpu.size();
    if (!sceneTexture || sceneTexture.width !== width || sceneTexture.height !== height) {
      sceneTexture?.destroy();
      sceneTexture = device.createTexture({
        label: "ink scene",
        size: { width, height },
        format: OFFSCREEN,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      sceneView = sceneTexture.createView();
      post.bind([sceneView]);
    }
    return sceneView!;
  };

  let scene: Scene = client.scene();
  let effects: InkEffects = effectsFor(scene);
  let page: PageModel | null = null;
  let pageViewport = { width: 0, height: 0 };
  let revealStart = 0;
  let scrollY = 0;
  let hovered: string | null = null;
  const seed = Math.random() * 100;

  const compose = (): void => {
    const { cssWidth, cssHeight } = gpu.size();
    pageViewport = { width: cssWidth, height: cssHeight };
    page = composePage(scene, pageViewport, measures.body, measures);
    for (const block of page.blocks) atlases[block.ink].ensure(block.text);
    scrollY = Math.min(scrollY, Math.max(0, page.height - cssHeight));
  };

  canvas.addEventListener(
    "wheel",
    (event) => {
      if (!page) return;
      scrollY = Math.max(0, Math.min(page.height - pageViewport.height, scrollY + event.deltaY));
      event.preventDefault();
    },
    { passive: false },
  );

  const glyphReveal = (block: PageBlock, blockStart: number): ((glyph: { index: number }) => Partial<GlyphStyle>) => {
    return (glyph) => ({ t0: blockStart + Math.min(1.6, glyph.index * 0.006) });
  };

  const drawPage = (pass: GPURenderPassEncoder, time: number): void => {
    if (!page) return;
    for (const renderer of Object.values(renderers)) renderer.begin();
    let cumulative = 0;
    for (const block of page.blocks) {
      const blockStart = revealStart + Math.min(2.4, cumulative * 0.0025 + block.order * 0.04);
      cumulative += block.layout.glyphs.length;
      const isHovered = block.actionId !== undefined && block.actionId === hovered && !block.disabled;
      const color = block.disabled ? DISABLED : isHovered ? HOVER : INKS[block.kind];
      const style: GlyphStyle = {
        color,
        wobble: block.kind === "choice" && isHovered ? 0.6 : effects.inkRun > 0 ? 0.8 : 0,
        weight: block.kind === "title" ? 0.02 : isHovered ? 0.05 : 0,
        softness: block.size > 30 ? 0.05 : 0.09,
      };
      renderers[block.ink].pushText(block.layout, block.x, block.y - scrollY, block.size, style, glyphReveal(block, blockStart));
    }
    for (const renderer of Object.values(renderers)) renderer.flush(pass, time, [pageViewport.width, pageViewport.height]);
  };

  return {
    onScene(next) {
      scene = next;
      effects = effectsFor(scene);
      revealStart = performance.now() / 1000 - startSeconds;
      scrollY = 0;
      hovered = null;
      compose();
    },
    frame(dt, time) {
      const size = gpu.size();
      if (!page || size.cssWidth !== pageViewport.width || size.cssHeight !== pageViewport.height) compose();
      const view = ensureTarget();
      const viewport: [number, number] = [size.cssWidth, size.cssHeight];
      const windX = (effects.wind - 0.5) * 60;

      const encoder = device.createCommandEncoder({ label: "ink frame" });
      snow.update(encoder, viewport, {
        dt,
        time,
        gravity: [0, 26],
        wind: [windX, 0],
        emitter: [-40, -60, size.cssWidth + 80, 30],
        color: [0.97, 0.95, 0.9, 0.7],
        size: 2.4,
        life: 16,
        turbulence: 45,
        mode: 0,
        density: effects.snowDensity,
        drag: 0.35,
        seed,
      });
      embers.update(encoder, viewport, {
        dt,
        time,
        gravity: [0, -75],
        wind: [windX * 0.6, -12],
        emitter: [0, size.cssHeight - 10, size.cssWidth, 40],
        color: [1, 0.62, 0.3, 0.95],
        size: 2.1,
        life: 3.8,
        turbulence: 110,
        mode: 1,
        density: effects.emberDensity,
        drag: 0.15,
        seed: seed + 7,
      });

      parchment.uniforms
        .set(0, [size.cssWidth, size.cssHeight, time, effects.candle, effects.soot, effects.inkRun > 0 ? 0 : scene.danger, effects.inkRun, seed])
        .upload();
      const scenePass = encoder.beginRenderPass({
        label: "ink scene",
        colorAttachments: [{ view, loadOp: "clear", clearValue: { r: 0.85, g: 0.78, b: 0.62, a: 1 }, storeOp: "store" }],
      });
      parchment.draw(scenePass);
      drawPage(scenePass, time);
      snow.draw(scenePass);
      embers.draw(scenePass);
      scenePass.end();

      post.uniforms.set(0, [size.cssWidth, size.cssHeight, time, effects.inkRun, 0.035, 0.35, 0, 0]).upload();
      const canvasPass = encoder.beginRenderPass({
        label: "ink composite",
        colorAttachments: [{ view: gpu.currentTexture().createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }],
      });
      post.draw(canvasPass);
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
      sceneTexture?.destroy();
    },
  };
}

const startSeconds = performance.now() / 1000;
