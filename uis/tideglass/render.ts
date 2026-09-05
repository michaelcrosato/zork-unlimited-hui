import { FullscreenPass, preprocessWgsl, WGSL_LIBS } from "@hui/gpu";
import { captionPanel, createSurface, scenePanel, type UiContext, type UiInstance } from "@hui/shell";
import { tankFor, tideglassLayout } from "./tank.ts";
import { WaveTank } from "./waves.ts";
import shader from "./wgsl/glass.wgsl?raw";

export async function render(ctx: UiContext): Promise<UiInstance> {
  const { gpu, canvas } = ctx;
  const surface = createSurface(ctx, {
    body: [0.7, 0.85, 0.82, 1], muted: [0.45, 0.65, 0.64, 1], title: [0.88, 0.98, 0.91, 1],
    accent: [0.38, 0.91, 0.76, 1], danger: [1, 0.52, 0.35, 1],
    panel: [0.018, 0.075, 0.08, 0.97], card: [0.04, 0.15, 0.155, 0.85], line: [0.22, 0.57, 0.51, 0.46],
  }, '"Trebuchet MS", sans-serif');
  const tank = new WaveTank(gpu);
  const glass = new FullscreenPass(gpu, { code: preprocessWgsl(shader, WGSL_LIBS), uniformBytes: 48, textures: 1, label: "refracted tideglass" });
  let scene = ctx.client.scene();
  let effects = tankFor(scene);
  let width = 0, height = 0;
  let layout = tideglassLayout(1600, 1000);
  let pulse = 0.8;
  let pointer: [number, number, number] = [0.5, 0.5, 0];
  const compose = (reset: boolean): void => {
    ({ cssWidth: width, cssHeight: height } = gpu.size());
    layout = tideglassLayout(width, height);
    const { measures } = surface;
    const panels = [
      captionPanel("brand", { x: 28, y: 62, width: layout.mobile ? width - 172 : 680, height: 100 }, layout.mobile ? "TIDEGLASS\nEXPEDITION" : "TIDEGLASS  /  EXPEDITION INSTRUMENTS", measures, layout.mobile ? 18 : 13),
      scenePanel(scene, "story", layout.story, measures, layout.mobile ? ["story", "actions", "log"] : ["story"]),
    ];
    if (!layout.mobile) {
      panels.push(scenePanel(scene, "log", layout.log, measures, ["log"]));
      panels.push(scenePanel(scene, "actions", layout.actions, measures, ["actions"]));
      const r = layout.tank;
      panels.push(captionPanel("gauge", { x: r.x + r.width / 2 - 52, y: r.y + r.height / 2 - 27, width: 160, height: 64 }, `HEALTH\n${scene.vitals.hp}${effects.healthKnown ? ` / ${scene.vitals.hpMax}` : ""}`, measures, 17, "title"));
      panels.push(captionPanel("legend", { x: r.x + 14, y: r.y + r.height - 16, width: r.width - 28, height: 22 }, "WATER · HEALTH   /   OUTER ARC · SUPPLIES", measures, 10, "muted"));
    }
    surface.setPanels(panels, reset);
  };
  const stir = (event: PointerEvent): void => {
    const r = layout.tank;
    const radius = Math.min(r.width, r.height) * 0.37;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left - r.x - r.width / 2) / (radius * 2) + 0.5;
    const y = (event.clientY - rect.top - r.y - r.height / 2) / (radius * 2) + 0.5;
    if (Math.hypot(x - 0.5, y - 0.5) < 0.48) pointer = [x, y, 0.18];
  };
  canvas.addEventListener("pointermove", stir);
  return {
    onScene(next) { scene = next; effects = tankFor(scene); pulse = 0.8; compose(true); },
    frame(dt, time) {
      const size = gpu.size();
      if (width !== size.cssWidth || height !== size.cssHeight) compose(false);
      const r = layout.tank;
      const encoder = gpu.device.createCommandEncoder();
      if (!surface.reducedMotion || pulse > 0) tank.step(encoder, surface.reducedMotion ? 1 / 60 : dt, surface.reducedMotion ? 0 : time, effects.danger, pulse, surface.reducedMotion ? [0.5, 0.5, 0] : pointer);
      pulse = 0;
      pointer[2] = 0;
      glass.bind([tank.view()]);
      glass.uniforms.set(0, [width, height, surface.reducedMotion ? 0 : time, effects.danger,
        r.x + r.width / 2, r.y + r.height / 2, Math.min(r.width, r.height) * 0.37, effects.health,
        effects.supplies, effects.healthKnown ? 1 : 0, effects.suppliesKnown ? 1 : 0, 0]).upload();
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: gpu.currentTexture().createView(), loadOp: "clear", storeOp: "store" }] });
      glass.draw(pass);
      surface.draw(pass, time);
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
    },
    hit: surface.hit,
    hover: surface.hover,
    destroy() { canvas.removeEventListener("pointermove", stir); surface.destroy(); tank.destroy(); glass.uniforms.buffer.destroy(); },
  };
}
