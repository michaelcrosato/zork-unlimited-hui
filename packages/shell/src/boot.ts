import { createMockClient, type GameClient, type Scene } from "@hui/core";
import { createGpu, type Gpu } from "@hui/gpu";
import { mountA11yMirror } from "./a11y.ts";
import { createHooks, type Hooks } from "./hooks.ts";
import { mountHud } from "./hud.ts";
import { actionForKey } from "./input.ts";
import "./shell.css";

export interface UiContext {
  gpu: Gpu;
  client: GameClient;
  canvas: HTMLCanvasElement;
  root: HTMLElement;
  slug: string;
  hooks: Hooks;
  params: URLSearchParams;
  /** Show a transient message in the shared HUD. */
  notice(text: string, tone?: "info" | "error"): void;
}

export interface UiInstance {
  /** Called once per animation frame with seconds since the last frame and since boot. */
  frame(dt: number, time: number): void;
  /** Called after every accepted action (and once at boot) with the new scene. */
  onScene?(scene: Scene): void;
  /** Map a pointer position (CSS pixels on the canvas) to an action id. */
  hit?(x: number, y: number): string | null;
  /** Pointer moved; return true when hovering something clickable. */
  hover?(x: number, y: number): boolean;
  destroy?(): void;
}

export interface UiSpec {
  slug: string;
  title: string;
  gallery?: { slug: string; title: string }[];
  render(ctx: UiContext): Promise<UiInstance>;
}

async function selectClient(params: URLSearchParams): Promise<{ client: GameClient; liveAvailable: boolean; note: string | null }> {
  const wanted = params.get("client");
  const liveAvailable = __ENGINE_AVAILABLE__;
  if (wanted === "mock" || (!liveAvailable && wanted !== "live")) {
    return { client: createMockClient(), liveAvailable, note: null };
  }
  if (!liveAvailable) {
    return { client: createMockClient(), liveAvailable, note: "The engine is not linked; playing the mock world." };
  }
  const adapter = await import("@zork-adapter");
  const storage = (() => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  })();
  return { client: adapter.createLiveClient(storage), liveAvailable, note: null };
}

function fatal(root: HTMLElement, title: string, message: string): void {
  const panel = document.createElement("main");
  panel.className = "hui-fatal";
  panel.innerHTML = `<section><h1>${title}</h1><p>${message}</p><p>Open <code>chrome://gpu</code> to check WebGPU, or return to the <a href="/">gallery</a>.</p></section>`;
  root.append(panel);
}

/**
 * Boot an interface: pick the client, create the canvas and GPU, mount the
 * accessibility mirror and HUD, wire input, run the frame loop, and expose
 * `window.__hui` for automation.
 */
export async function bootUi(spec: UiSpec): Promise<void> {
  const root = document.getElementById("app") ?? document.body;
  const params = new URLSearchParams(window.location.search);
  const canvas = document.createElement("canvas");
  canvas.className = "hui-canvas";
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", `${spec.title}, rendered scene`);
  root.append(canvas);

  const { client, liveAvailable, note } = await selectClient(params);
  const hud = mountHud({
    root,
    slug: spec.slug,
    title: spec.title,
    clientKind: client.kind,
    liveAvailable,
    gallery: spec.gallery ?? [],
  });
  if (note) hud.notice(note);

  let samplePending: ((sample: HuiSample) => void) | null = null;
  const hooks = createHooks({
    ui: spec.slug,
    client,
    sample: () => new Promise<HuiSample>((resolve) => (samplePending = resolve)),
  });
  window.__hui = hooks;

  let gpu: Gpu;
  try {
    gpu = await createGpu(canvas);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    hooks.fail(message);
    fatal(root, "WebGPU could not start", message);
    return;
  }

  const act = (id: string): void => {
    const result = client.act(id);
    if (!result.ok) hud.notice(result.message, "error");
  };
  // Validation failures are asynchronous. Surface the first one just like a
  // thrown render error, so a running frame counter cannot hide a blank canvas.
  gpu.device.addEventListener("uncapturederror", (event) => {
    event.preventDefault();
    if (hooks.error) return;
    hooks.fail(event.error.message);
    hud.notice(event.error.message, "error");
    console.error(event.error.message);
  });
  const mirror = mountA11yMirror(root, act);

  const ctx: UiContext = {
    gpu,
    client,
    canvas,
    root,
    slug: spec.slug,
    hooks,
    params,
    notice: (text, tone) => hud.notice(text, tone),
  };

  let instance: UiInstance;
  try {
    instance = await spec.render(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    hooks.fail(message);
    fatal(root, `${spec.title} failed to start`, message);
    console.error(error);
    return;
  }

  const applyScene = (scene: Scene): void => {
    mirror.update(scene);
    instance.onScene?.(scene);
  };
  applyScene(client.scene());
  client.subscribe(applyScene);

  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
    const id = actionForKey(event.code, client.scene());
    if (id) {
      event.preventDefault();
      act(id);
    }
  });
  // A click is a press and release within a few pixels; anything longer is a
  // drag the interface may use for its own camera or scrolling.
  let press: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    press = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!press || !instance.hit) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    press = null;
    if (moved > 6) return;
    const rect = canvas.getBoundingClientRect();
    const id = instance.hit(event.clientX - rect.left, event.clientY - rect.top);
    if (id) act(id);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!instance.hover) return;
    const rect = canvas.getBoundingClientRect();
    canvas.classList.toggle("is-pointing", instance.hover(event.clientX - rect.left, event.clientY - rect.top));
  });

  const readback = async (resolve: (sample: HuiSample) => void): Promise<void> => {
    const { device } = gpu;
    // A 256-pixel-wide centre block: wide enough to see real detail, and 1024
    // bytes per row satisfies the 256-byte copy alignment for 8-bit formats.
    const texture = gpu.currentTexture();
    const width = Math.min(256, texture.width);
    const height = Math.min(256, texture.height);
    const x = Math.max(0, Math.floor(texture.width / 2 - width / 2));
    const y = Math.max(0, Math.floor(texture.height / 2 - height / 2));
    const bytesPerRow = 1024;
    const buffer = device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture, origin: { x, y } }, { buffer, bytesPerRow }, { width, height });
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const data = new Uint8Array(buffer.getMappedRange());
    const colours = new Set<number>();
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const i = row * bytesPerRow + col * 4;
        colours.add(((data[i]! >> 3) << 10) | ((data[i + 1]! >> 3) << 5) | (data[i + 2]! >> 3));
      }
    }
    buffer.unmap();
    buffer.destroy();
    resolve({ nonBlank: colours.size > 1, distinct: colours.size, width, height });
  };

  let last = performance.now();
  const start = last;
  let hudTimer = 0;
  const loop = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    try {
      instance.frame(dt, (now - start) / 1000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      hooks.fail(message);
      hud.notice(message, "error");
      console.error(error);
      return;
    }
    if (samplePending) {
      const resolve = samplePending;
      samplePending = null;
      void readback(resolve);
    }
    hooks.markFrame(now);
    if (!hooks.ready) hooks.setReady();
    hudTimer += dt;
    if (hudTimer > 0.5) {
      hudTimer = 0;
      hud.setFps(hooks.fps);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
