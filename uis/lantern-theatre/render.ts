import { ADDITIVE_BLEND, FullscreenPass, ParticleSystem, preprocessWgsl, WGSL_LIBS } from "@hui/gpu";
import { captionPanel, createSurface, scenePanel, type UiContext, type UiInstance } from "@hui/shell";
import { stageFor, theatreLayout } from "./stage.ts";
import shader from "./wgsl/stage.wgsl?raw";

export async function render(ctx: UiContext): Promise<UiInstance> {
  const { gpu } = ctx;
  const surface = createSurface(ctx, {
    body: [0.87, 0.8, 0.71, 1], muted: [0.65, 0.55, 0.49, 1], title: [1, 0.92, 0.77, 1],
    accent: [1, 0.63, 0.36, 1], danger: [1, 0.32, 0.29, 1],
    panel: [0.078, 0.046, 0.043, 0.96], card: [0.19, 0.09, 0.06, 0.64], line: [0.66, 0.34, 0.18, 0.44],
  });
  const backdrop = new FullscreenPass(gpu, { code: preprocessWgsl(shader, WGSL_LIBS), uniformBytes: 64, label: "paper theatre and velvet" });
  const dust = new ParticleSystem(gpu, 12_288, { blend: ADDITIVE_BLEND, label: "stage dust" });
  let scene = ctx.client.scene();
  let effects = stageFor(scene);
  let width = 0, height = 0;
  let layout = theatreLayout(1600, 1000);
  const compose = (reset: boolean): void => {
    ({ cssWidth: width, cssHeight: height } = gpu.size());
    layout = theatreLayout(width, height);
    const { measures } = surface;
    const r = layout.stage;
    const panels = [
      captionPanel("brand", { x: r.x + (layout.mobile ? 18 : 54), y: r.y + 22, width: r.width - 90, height: 24 }, "LANTERN THEATRE", measures, 11),
      captionPanel("marquee", { x: r.x + (layout.mobile ? 18 : 54), y: r.y + 49, width: layout.mobile ? r.width - 80 : r.width * 0.52, height: layout.mobile ? 85 : 160 }, scene.place.name, measures, layout.mobile ? 27 : 48, "title", "display"),
      scenePanel(scene, "story", layout.story, measures, layout.mobile ? ["story", "actions", "log"] : ["story", "log"]),
    ];
    if (!layout.mobile) {
      panels.push(scenePanel(scene, "actions", layout.actions, measures, ["actions"]));
      const paths = scene.actions.filter(a => (a.kind === "move" || a.kind === "travel") && !a.disabledReason).length;
      const talks = scene.actions.filter(a => a.kind === "talk" && !a.disabledReason).length;
      panels.push(captionPanel("stage-note", { x: r.x + 54, y: r.y + r.height - 38, width: r.width - 108, height: 30 }, `DAY ${scene.vitals.day}  /  ${scene.vitals.time}     ·     ${paths} OPEN PATHS     ·     ${talks} TALK OPTIONS`, measures, 11, "title"));
    }
    surface.setPanels(panels, reset);
  };
  return {
    onScene(next) { scene = next; effects = stageFor(scene); compose(true); },
    frame(dt, time) {
      const size = gpu.size();
      if (width !== size.cssWidth || height !== size.cssHeight) compose(false);
      const r = layout.stage;
      const animationTime = surface.reducedMotion ? 0 : time;
      backdrop.uniforms.set(0, [width, height, animationTime, effects.danger, r.x, r.y, r.width, r.height,
        effects.seed, effects.doors, effects.company, effects.curtain, scene.vitals.hp, 0, 0, 0]).upload();
      const encoder = gpu.device.createCommandEncoder();
      if (!surface.reducedMotion) dust.update(encoder, [width, height], {
        dt, time, gravity: [0, -2], wind: [5, -1], emitter: [r.x, r.y, r.width, r.height],
        color: [1, 0.74, 0.36, 0.32], size: 1.5, life: 8, turbulence: 7 + effects.danger * 18,
        mode: 2, density: 0.06 + effects.danger * 0.08, drag: 0.6, seed: effects.seed,
      });
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: gpu.currentTexture().createView(), loadOp: "clear", storeOp: "store" }] });
      backdrop.draw(pass);
      if (!surface.reducedMotion) {
        const sx = size.width / width, sy = size.height / height;
        pass.setScissorRect(Math.floor(r.x * sx), Math.floor(r.y * sy), Math.floor(r.width * sx), Math.floor(r.height * sy));
        dust.draw(pass);
        pass.setScissorRect(0, 0, size.width, size.height);
      }
      surface.draw(pass, time, shapes => {
        shapes.rect(r.x, r.y, r.width, r.height, [0.9, 0.57, 0.29, 0.5], 0, 1);
        shapes.rect(r.x + 8, r.y + 8, r.width - 16, r.height - 16, [0.9, 0.57, 0.29, 0.22], 0, 1);
      });
      pass.end();
      gpu.device.queue.submit([encoder.finish()]);
    },
    hit: surface.hit,
    hover: surface.hover,
    destroy() { dust.destroy(); surface.destroy(); backdrop.uniforms.buffer.destroy(); },
  };
}
