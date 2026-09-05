// Scaffold a new interface: `pnpm new-ui <slug> ["Title"]`.
// Creates uis/<slug>/ with a working minimal WebGPU interface (a shaded
// backdrop plus the shared text page), a manifest, and a unit test. The
// gallery, the Vite build and the e2e suite pick the folder up automatically.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const slug = process.argv[2];
// A leading underscore marks a scratch interface: gitignored and left out of the gallery.
if (!slug || !/^_?[a-z][a-z0-9-]*$/.test(slug)) {
  console.error("usage: pnpm new-ui <slug> [\"Title\"]   (slug: lowercase letters, digits, hyphens; leading _ for scratch)");
  process.exit(1);
}
const title = process.argv[3] ?? slug.replace(/(^|-)(\w)/g, (_, dash, ch) => `${dash ? " " : ""}${ch.toUpperCase()}`);
const dir = join(repoRoot, "uis", slug);
if (existsSync(dir)) {
  console.error(`uis/${slug} already exists`);
  process.exit(1);
}
mkdirSync(join(dir, "wgsl"), { recursive: true });
mkdirSync(join(dir, "test"), { recursive: true });

const files = {
  "ui.json": `${JSON.stringify({ title, tagline: `${title}: describe the idea in one sentence.`, techniques: ["fullscreen shader", "SDF text"], accent: "#74cbe2" }, null, 2)}\n`,
  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title} · zork-unlimited-hui</title>
    <link rel="icon" href="data:," />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
`,
  "main.ts": `import { bootUi } from "@hui/shell";
import { uis } from "virtual:hui-gallery";
import { render } from "./render.ts";

void bootUi({ slug: "${slug}", title: "${title}", gallery: uis, render });
`,
  "palette.ts": `import type { Scene } from "@hui/core";

/** Scene-derived colour temperature for the backdrop, 0 cold .. 1 warm. Pure, so it is unit tested. */
export function warmthFor(scene: Scene): number {
  const talk = scene.actions.some((a) => a.kind === "talk") || scene.dialogue !== null ? 0.35 : 0;
  return Math.min(1, Math.max(0, 0.25 + talk + scene.danger * 0.4));
}
`,
  "render.ts": `import type { Scene } from "@hui/core";
import { FullscreenPass, TextAtlas, TextRenderer, WGSL_LIBS, preprocessWgsl } from "@hui/gpu";
import { blockAt, composePage, type Ink, type PageModel, type UiContext, type UiInstance } from "@hui/shell";
import { warmthFor } from "./palette.ts";
import backdropWgsl from "./wgsl/backdrop.wgsl?raw";

const FAMILY = 'Georgia, "Times New Roman", serif';

export async function render(ctx: UiContext): Promise<UiInstance> {
  const { gpu, client, canvas } = ctx;
  const atlases: Record<Ink, TextAtlas> = {
    body: new TextAtlas(gpu.device, { family: FAMILY, px: 48, padding: 8 }),
    display: new TextAtlas(gpu.device, { family: FAMILY, px: 48, padding: 8, weight: "700" }),
    italic: new TextAtlas(gpu.device, { family: FAMILY, px: 48, padding: 8, style: "italic" }),
  };
  const text: Record<Ink, TextRenderer> = {
    body: new TextRenderer(gpu, atlases.body),
    display: new TextRenderer(gpu, atlases.display),
    italic: new TextRenderer(gpu, atlases.italic),
  };
  const measures = {
    body: (ch: string, size: number) => atlases.body.measure(ch, size),
    display: (ch: string, size: number) => atlases.display.measure(ch, size),
    italic: (ch: string, size: number) => atlases.italic.measure(ch, size),
  };
  const backdrop = new FullscreenPass(gpu, { code: preprocessWgsl(backdropWgsl, WGSL_LIBS), uniformBytes: 16, label: "backdrop" });

  let scene: Scene = client.scene();
  let page: PageModel | null = null;
  let viewport = { width: 0, height: 0 };
  let scrollY = 0;
  let hovered: string | null = null;
  const compose = (): void => {
    const { cssWidth, cssHeight } = gpu.size();
    viewport = { width: cssWidth, height: cssHeight };
    page = composePage(scene, viewport, measures.body, measures);
    for (const block of page.blocks) atlases[block.ink].ensure(block.text);
  };
  canvas.addEventListener("wheel", (event) => {
    if (page) scrollY = Math.max(0, Math.min(Math.max(0, page.height - viewport.height), scrollY + event.deltaY));
  });

  return {
    onScene(next) {
      scene = next;
      scrollY = 0;
      compose();
    },
    frame(_dt, time) {
      const size = gpu.size();
      if (!page || size.cssWidth !== viewport.width || size.cssHeight !== viewport.height) compose();
      backdrop.uniforms.set(0, [size.cssWidth, size.cssHeight, time, warmthFor(scene)]).upload();
      const encoder = gpu.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: gpu.currentTexture().createView(), loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }],
      });
      backdrop.draw(pass);
      for (const renderer of Object.values(text)) renderer.begin();
      for (const block of page!.blocks) {
        const active = block.actionId !== undefined && block.actionId === hovered;
        const color: [number, number, number, number] = block.disabled ? [0.5, 0.5, 0.5, 0.8] : active ? [1, 0.9, 0.6, 1] : block.kind === "choice" ? [1, 0.7, 0.3, 1] : [0.92, 0.9, 0.85, 1];
        text[block.ink].pushText(block.layout, block.x, block.y - scrollY, block.size, { color, softness: 0.09 });
      }
      for (const renderer of Object.values(text)) renderer.flush(pass, time, [size.cssWidth, size.cssHeight]);
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
    },
    hit(x, y) {
      const block = page ? blockAt(page, x, y + scrollY) : null;
      return block && !block.disabled ? (block.actionId ?? null) : null;
    },
    hover(x, y) {
      const block = page ? blockAt(page, x, y + scrollY) : null;
      hovered = block && !block.disabled ? (block.actionId ?? null) : null;
      return hovered !== null;
    },
  };
}
`,
  "wgsl/backdrop.wgsl": `#include "noise"

// Starting point: a slow drifting gradient whose warmth follows the scene.
struct BackdropUniforms {
  viewport: vec2f,
  time: f32,
  warmth: f32,
};

@group(0) @binding(0) var<uniform> u: BackdropUniforms;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let n = fbm2(uv * vec2f(u.viewport.x / u.viewport.y, 1.0) * 2.0 + vec2f(u.time * 0.03), 4);
  let cold = vec3f(0.05, 0.08, 0.12);
  let warm = vec3f(0.16, 0.09, 0.05);
  let base = mix(cold, warm, u.warmth);
  return vec4f(base * (0.7 + 0.6 * n), 1.0);
}
`,
  "test/palette.test.ts": `import { describe, expect, it } from "vitest";
import { createMockClient } from "@hui/core";
import { warmthFor } from "../palette.ts";

describe("warmthFor", () => {
  it("is warmer where there is someone to talk to", () => {
    const client = createMockClient();
    const tutorial = warmthFor(client.scene());
    client.act("meta:begin");
    expect(warmthFor(client.scene())).toBeGreaterThan(tutorial);
  });

  it("stays within 0 and 1", () => {
    const client = createMockClient();
    client.act("meta:begin");
    const value = warmthFor({ ...client.scene(), danger: 9 });
    expect(value).toBeLessThanOrEqual(1);
    expect(value).toBeGreaterThanOrEqual(0);
  });
});
`,
};

for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
console.log(`created uis/${slug}/ (${Object.keys(files).length} files)`);
console.log(`next: pnpm test && pnpm dev, then open /uis/${slug}/`);
