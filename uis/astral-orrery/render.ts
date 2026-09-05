import { FullscreenPass, preprocessWgsl, WGSL_LIBS } from "@hui/gpu";
import { captionPanel, createSurface, scenePanel, type UiContext, type UiInstance } from "@hui/shell";
import { orreryLayout, satellites } from "./layout.ts";
import shader from "./wgsl/orrery.wgsl?raw";

export async function render(ctx: UiContext): Promise<UiInstance> {
  const { gpu } = ctx;
  const surface = createSurface(ctx, {
    body: [0.79, 0.82, 0.9, 1], muted: [0.55, 0.6, 0.73, 1], title: [0.94, 0.91, 0.83, 1],
    accent: [0.9, 0.73, 0.43, 1], danger: [1, 0.42, 0.4, 1],
    panel: [0.035, 0.046, 0.089, 0.94], card: [0.09, 0.105, 0.17, 0.8], line: [0.48, 0.44, 0.38, 0.45],
  });
  const backdrop = new FullscreenPass(gpu, { code: preprocessWgsl(shader, WGSL_LIBS), uniformBytes: 48, label: "astral sky and orbital engravings" });
  let scene = ctx.client.scene();
  let width = 0, height = 0;
  let layout = orreryLayout(1600, 1000);
  let nodes = satellites(scene, layout.instrument);
  const compose = (reset: boolean): void => {
    ({ cssWidth: width, cssHeight: height } = gpu.size());
    layout = orreryLayout(width, height);
    nodes = layout.mobile ? [] : satellites(scene, layout.instrument);
    const { measures } = surface;
    const panels = [
      captionPanel("brand", { x: 28, y: 64, width: layout.mobile ? width - 170 : 700, height: 130 }, layout.mobile ? "ASTRAL\nORRERY" : "ASTRAL ORRERY / THE CELESTIAL READING ROOM", measures, layout.mobile ? 21 : 13, "accent"),
      scenePanel(scene, "story", layout.story, measures, layout.mobile ? ["story", "actions", "log"] : ["story", "log"]),
    ];
    if (!layout.mobile) {
      panels.push(scenePanel(scene, "actions", layout.actions, measures, ["actions"]));
      panels.push(captionPanel("orbit-guide", { x: layout.instrument.x + 12, y: 76, width: layout.instrument.width - 24, height: 30 }, "THE POSSIBLE PATHS  /  SELECT A NUMBERED STAR", measures, 11));
      const center = layout.instrument;
      panels.push(captionPanel("heart", { x: center.x + center.width / 2 - 51, y: center.y + center.height / 2 - 27, width: 130, height: 70 }, `DAY ${String(scene.vitals.day).padStart(2, "0")}\n${scene.vitals.time}`, measures, 17, "title"));
      for (const node of nodes) panels.push(captionPanel(`star-${node.number}`, { x: node.cx - 5, y: node.cy - 11, width: 22, height: 26 }, String(node.number), measures, 17, node.disabled ? "muted" : "title"));
    }
    surface.setPanels(panels, reset);
    surface.setShortcuts(nodes);
  };
  return {
    onScene(next) { scene = next; compose(true); },
    frame(_dt, time) {
      const size = gpu.size();
      if (width !== size.cssWidth || height !== size.cssHeight) compose(false);
      const r = layout.instrument;
      backdrop.uniforms.set(0, [width, height, surface.reducedMotion ? 0 : time, scene.danger,
        r.x + r.width / 2, r.y + r.height / 2, Math.min(r.width * 0.37, r.height * 0.39), scene.vitals.day,
        scene.ending?.death ? 1 : 0, 0, 0, 0]).upload();
      const encoder = gpu.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: gpu.currentTexture().createView(), loadOp: "clear", storeOp: "store" }] });
      backdrop.draw(pass);
      surface.draw(pass, time, shapes => {
        for (const node of nodes) {
          const active = surface.hovered === node.id;
          shapes.circle(node.cx, node.cy, active ? 28 : 24, [0.05, 0.07, 0.13, 1]);
          shapes.circle(node.cx, node.cy, active ? 28 : 24, node.disabled ? surface.palette.muted : surface.palette.accent, active ? 2 : 1);
          shapes.circle(node.cx, node.cy, 30, [0.9, 0.7, 0.4, active ? 0.35 : 0.09], 1);
        }
      });
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
    },
    hit: surface.hit,
    hover: surface.hover,
    destroy() { surface.destroy(); backdrop.uniforms.buffer.destroy(); },
  };
}
