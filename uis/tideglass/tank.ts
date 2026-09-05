import type { Scene } from "@hui/core";

export function tankFor(scene: Scene) {
  const ratio = (n: number, max: number | null) => max !== null && max > 0 ? Math.max(0, Math.min(1, n / max)) : 0.5;
  return {
    health: ratio(scene.vitals.hp, scene.vitals.hpMax),
    supplies: ratio(scene.vitals.supplies, scene.vitals.suppliesMax),
    suppliesKnown: scene.vitals.suppliesMax !== null && scene.vitals.suppliesMax > 0,
    danger: Math.max(0, Math.min(1, scene.danger)),
    healthKnown: scene.vitals.hpMax !== null && scene.vitals.hpMax > 0,
  };
}

export function tideglassLayout(width: number, height: number) {
  const mobile = width < 1100 || height < 620;
  const logWidth = Math.max(230, Math.round(width * 0.18));
  const actionWidth = Math.max(320, Math.round(width * 0.28));
  const centerX = logWidth + 44;
  const centerWidth = width - centerX - actionWidth - 48;
  const tankHeight = Math.min(350, height * 0.38);
  return {
    mobile,
    tank: mobile ? { x: width - 142, y: 72, width: 120, height: 120 }
      : { x: centerX, y: 104, width: centerWidth, height: tankHeight },
    log: { x: 24, y: 104, width: logWidth, height: Math.max(80, height - 128) },
    story: mobile ? { x: 16, y: 220, width: width - 32, height: Math.max(80, height - 236) }
      : { x: centerX, y: tankHeight + 126, width: centerWidth, height: Math.max(80, height - tankHeight - 150) },
    actions: { x: width - actionWidth - 24, y: 104, width: actionWidth, height: Math.max(80, height - 128) },
  };
}
