import { ShapeRenderer, TextAtlas, TextRenderer, type Rgba } from "@hui/gpu";
import type { UiContext } from "./boot.ts";
import type { Ink } from "./page.ts";
import { clampScroll, contains, type ActionCard, type Measures, type Rect, type SurfacePanel, type Tone } from "./surface-model.ts";

export interface SurfacePalette extends Record<Tone, Rgba> {
  panel: Rgba; card: Rgba; line: Rgba;
}

/** GPU reading surfaces with scissored, independently scrolling panels. */
export function createSurface(ctx: UiContext, palette: SurfacePalette, family = "Georgia, serif", options: { format?: GPUTextureFormat; displayFamily?: string; atlasPx?: number; displayPx?: number } = {}) {
  const { gpu, canvas, root } = ctx;
  const atlases: Record<Ink, TextAtlas> = {
    body: new TextAtlas(gpu.device, { family, px: options.atlasPx ?? 48 }),
    display: new TextAtlas(gpu.device, { family: options.displayFamily ?? family, weight: "700", px: options.displayPx ?? 48 }),
    italic: new TextAtlas(gpu.device, { family: '"Cascadia Mono", Consolas, monospace', px: options.atlasPx ?? 48 }),
  };
  const measures: Measures = {
    body: (ch, size) => atlases.body.measure(ch, size),
    display: (ch, size) => atlases.display.measure(ch, size),
    italic: (ch, size) => atlases.italic.measure(ch, size),
  };
  // A separate instance buffer per panel prevents later queue writes replacing
  // an earlier panel's text before the shared command buffer is submitted.
  const banks = new Map<string, Record<Ink, TextRenderer>>();
  const shapes = new ShapeRenderer(gpu, options.format ?? gpu.format);
  let panels: SurfacePanel[] = [];
  let shortcuts: ActionCard[] = [];
  let hovered: string | null = null;
  let active: SurfacePanel | undefined;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const visibleCards = (): ActionCard[] => {
    const result = [...shortcuts];
    for (const panel of panels) {
      for (const card of panel.cards) {
        const top = panel.rect.y + card.y - panel.scroll;
        const y = Math.max(panel.rect.y, top);
        const bottom = Math.min(panel.rect.y + panel.rect.height, top + card.height);
        if (bottom - y < 10) continue;
        result.push({ ...card, x: panel.rect.x + card.x, y, height: bottom - y });
      }
    }
    return result;
  };
  ctx.hooks.layout = () => ({
    panels: panels.filter(p => p.chrome).map(p => ({ id: p.id, ...p.rect, scroll: p.scroll, maxScroll: clampScroll(p, Infinity) })),
    actions: visibleCards(),
  });
  const panelAt = (x: number, y: number) => panels.find(p => p.chrome && contains(p.rect, x, y));
  const hit = (x: number, y: number): string | null => visibleCards().find(c => !c.disabled && contains(c, x, y))?.id ?? null;
  const scroll = (panel: SurfacePanel, delta: number): void => { panel.scroll = clampScroll(panel, panel.scroll + delta); hovered = null; };
  const point = (event: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [event.clientX - r.left, event.clientY - r.top];
  };
  const wheel = (event: WheelEvent): void => {
    const panel = panelAt(...point(event)) ?? active ?? panels.find(p => p.chrome);
    if (!panel) return;
    active = panel;
    scroll(panel, event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? panel.rect.height : 1));
    event.preventDefault();
  };
  canvas.addEventListener("wheel", wheel, { passive: false });
  let touch: { id: number; y: number; panel: SurfacePanel } | null = null;
  const down = (event: PointerEvent): void => {
    const panel = panelAt(...point(event));
    if (panel) active = panel;
    if (event.pointerType !== "touch" || !panel) return;
    touch = { id: event.pointerId, y: event.clientY, panel };
    canvas.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent): void => {
    if (!touch || event.pointerId !== touch.id) return;
    scroll(touch.panel, touch.y - event.clientY);
    touch.y = event.clientY;
  };
  const up = (): void => { touch = null; };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  const key = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.defaultPrevented) return;
    if ((event.target as HTMLElement)?.closest("input, textarea, select")) return;
    const panel = active ?? panels.find(p => p.chrome);
    if (!panel) return;
    const deltas: Record<string, number> = { PageDown: panel.rect.height * 0.8, PageUp: -panel.rect.height * 0.8, Home: -Infinity, End: Infinity };
    if (!(event.code in deltas)) return;
    scroll(panel, deltas[event.code]!);
    event.preventDefault();
  };
  window.addEventListener("keydown", key);
  const focus = (event: FocusEvent): void => {
    const button = event.target as HTMLElement;
    if (!button.matches(".hui-a11y button")) return;
    const index = [...root.querySelectorAll(".hui-a11y button")].indexOf(button);
    const action = ctx.client.scene().actions[index];
    if (!action) return;
    hovered = action.id;
    for (const panel of panels) {
      const card = panel.cards.find(c => c.id === action.id);
      if (!card) continue;
      active = panel;
      if (card.y < panel.scroll || card.y + card.height > panel.scroll + panel.rect.height) panel.scroll = clampScroll(panel, card.y - 24);
      break;
    }
  };
  root.addEventListener("focusin", focus);

  return {
    measures,
    palette,
    get reducedMotion() { return motion.matches; },
    get hovered() { return hovered; },
    setPanels(next: SurfacePanel[], reset = true): void {
      for (const panel of next) {
        if (!reset) panel.scroll = clampScroll(panel, panels.find(p => p.id === panel.id)?.scroll ?? 0);
        if (!banks.has(panel.id)) banks.set(panel.id, {
          body: new TextRenderer(gpu, atlases.body, { capacity: 24000, format: options.format }),
          display: new TextRenderer(gpu, atlases.display, { capacity: 12000, format: options.format }),
          italic: new TextRenderer(gpu, atlases.italic, { capacity: 12000, format: options.format }),
        });
        for (const block of panel.blocks) atlases[block.ink].ensure(block.text);
      }
      panels = next;
      active = panels.find(p => p.id === active?.id) ?? panels.find(p => p.chrome);
      hovered = null;
    },
    setShortcuts(next: ActionCard[]): void { shortcuts = next; },
    hit,
    hover(x: number, y: number): boolean { hovered = hit(x, y); return hovered !== null; },
    draw(pass: GPURenderPassEncoder, time: number, decorate?: (shapes: ShapeRenderer) => void): void {
      shapes.begin();
      decorate?.(shapes);
      for (const panel of panels) {
        if (!panel.chrome) continue;
        const r = panel.rect;
        if (!panel.unframed) {
          shapes.rect(r.x, r.y, r.width, r.height, palette.panel, 3);
          shapes.rect(r.x, r.y, r.width, 1, palette.line);
        }
        for (const card of panel.cards) {
          const top = r.y + card.y - panel.scroll;
          const y = Math.max(r.y, top);
          const h = Math.min(r.y + r.height, top + card.height) - y;
          if (h <= 0) continue;
          const selected = hovered === card.id && !card.disabled;
          shapes.rect(r.x + card.x, y, card.width, h, selected ? [...palette.accent.slice(0, 3), 0.13] as Rgba : palette.card, 2);
          shapes.rect(r.x + card.x, y, selected ? 3 : 1, h, selected ? palette.accent : palette.line);
        }
        if (panel.contentHeight > r.height) {
          const h = Math.max(24, r.height * r.height / panel.contentHeight);
          const y = r.y + (r.height - h) * panel.scroll / (panel.contentHeight - r.height);
          shapes.rect(r.x + r.width - 5, r.y, 2, r.height, palette.line);
          shapes.rect(r.x + r.width - 5, y, 2, h, palette.accent);
        }
      }
      shapes.flush(pass);
      const size = gpu.size();
      for (const panel of panels) {
        const bank = banks.get(panel.id)!;
        const r = panel.rect;
        const sx = size.width / size.cssWidth, sy = size.height / size.cssHeight;
        const left = Math.max(0, Math.floor(r.x * sx)), top = Math.max(0, Math.floor(r.y * sy));
        const right = Math.min(size.width, Math.ceil((r.x + r.width) * sx)), bottom = Math.min(size.height, Math.ceil((r.y + r.height) * sy));
        if (right <= left || bottom <= top) continue;
        pass.setScissorRect(left, top, right - left, bottom - top);
        for (const renderer of Object.values(bank)) renderer.begin();
        for (const block of panel.blocks) {
          const y = block.y - panel.scroll;
          if (y + block.layout.height < 0 || y > r.height) continue;
          // Cull individual lines in exceptionally long authored paragraphs.
          const layout = { ...block.layout, glyphs: block.layout.glyphs.filter(g => y + g.y + block.size * 1.5 >= 0 && y + g.y <= r.height) };
          bank[block.ink].pushText(layout, r.x + block.x, r.y + y, block.size, { color: palette[block.tone], softness: 0.075 });
        }
        for (const renderer of Object.values(bank)) renderer.flush(pass, time, [size.cssWidth, size.cssHeight]);
      }
      pass.setScissorRect(0, 0, size.width, size.height);
    },
    destroy(): void {
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key);
      root.removeEventListener("focusin", focus);
      shapes.destroy();
      for (const bank of banks.values()) for (const renderer of Object.values(bank)) renderer.destroy();
      for (const atlas of Object.values(atlases)) atlas.texture.destroy();
      delete ctx.hooks.layout;
    },
  };
}

export type Surface = ReturnType<typeof createSurface>;
export type { Rect };
