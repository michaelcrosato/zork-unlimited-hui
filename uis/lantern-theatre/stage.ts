import type { Scene } from "@hui/core";

export function stageFor(scene: Scene) {
  let seed = 0;
  for (const ch of scene.place.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    seed: (seed % 1000) / 100,
    doors: Math.min(5, scene.actions.filter(a => (a.kind === "move" || a.kind === "travel") && !a.disabledReason).length),
    company: Math.min(4, scene.actions.filter(a => a.kind === "talk" && !a.disabledReason).length + (scene.dialogue ? 1 : 0)),
    danger: Math.max(0, Math.min(1, scene.danger)),
    curtain: scene.ending?.death ? 0.7 : scene.ending ? 0.38 : 0,
  };
}

export function theatreLayout(width: number, height: number) {
  const mobile = width < 900 || height < 620;
  const stageHeight = mobile ? 168 : Math.min(350, height * 0.34);
  const top = 70 + stageHeight + 24;
  const storyWidth = Math.round((width - 72) * 0.61);
  return {
    mobile,
    stage: { x: 16, y: 64, width: width - 32, height: stageHeight },
    story: { x: mobile ? 16 : 24, y: top, width: mobile ? width - 32 : storyWidth, height: Math.max(80, height - top - 24) },
    actions: { x: storyWidth + 48, y: top, width: width - storyWidth - 72, height: Math.max(80, height - top - 24) },
  };
}
