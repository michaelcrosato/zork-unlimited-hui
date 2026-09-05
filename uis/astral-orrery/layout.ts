import type { Scene } from "@hui/core";
import type { ActionCard, Rect } from "@hui/shell";

export function orreryLayout(width: number, height: number) {
  const mobile = width < 900 || height < 620;
  const left = Math.round(width * 0.43);
  const instrument: Rect = mobile
    ? { x: width - 146, y: 76, width: 122, height: 122 }
    : { x: left + 24, y: 118, width: width - left - 48, height: Math.min(380, height * 0.4) };
  const bottom = instrument.y + instrument.height + 22;
  return {
    mobile, instrument,
    story: mobile ? { x: 16, y: 224, width: width - 32, height: Math.max(80, height - 240) }
      : { x: 24, y: 118, width: left - 24, height: Math.max(80, height - 142) },
    actions: { x: left + 24, y: bottom, width: width - left - 48, height: Math.max(80, height - bottom - 24) },
  };
}

/** Fixed targets: ambient orbital animation never moves a choice under a pointer. */
export function satellites(scene: Scene, rect: Rect): (ActionCard & { number: number; cx: number; cy: number })[] {
  const actions = scene.actions.filter(a => a.primary).slice(0, 8);
  const radius = Math.min(rect.width * 0.37, rect.height * 0.39);
  return actions.map((action, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / Math.max(3, actions.length);
    const cx = rect.x + rect.width / 2 + Math.cos(angle) * radius;
    const cy = rect.y + rect.height / 2 + Math.sin(angle) * radius;
    return { id: action.id, number: i + 1, disabled: action.disabledReason !== undefined, cx, cy, x: cx - 23, y: cy - 23, width: 46, height: 46 };
  });
}
