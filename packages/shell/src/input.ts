import type { Action, Scene } from "@hui/core";

/** The actions that belong on the main decision surface, in scene order. */
export function primaryActions(scene: Scene): Action[] {
  return scene.actions.filter((action) => action.primary);
}

/**
 * Number keys 1–9 (digit row or numpad) pick the nth primary action. Disabled
 * cards keep their number so the numbering matches what the player sees, but
 * pressing them does nothing.
 */
export function actionForKey(code: string, scene: Scene): string | null {
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(code);
  if (!match) return null;
  const action = primaryActions(scene)[Number(match[1]) - 1];
  if (!action || action.disabledReason) return null;
  return action.id;
}

/** Cyclic index stepping for focus rings; -1 when there is nothing to focus. */
export function nextIndex(current: number, count: number, delta: number): number {
  if (count <= 0) return -1;
  return (((current + delta) % count) + count) % count;
}
