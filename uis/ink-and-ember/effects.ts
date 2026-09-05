import type { Scene } from "@hui/core";

/** Scene-derived knobs for the parchment, particles and post-process. All 0..1. */
export interface InkEffects {
  /** Share of the snow pool alive. */
  snowDensity: number;
  /** Share of the ember pool alive. */
  emberDensity: number;
  /** Lateral wind strength. */
  wind: number;
  /** Ink running down the page (death ending). */
  inkRun: number;
  /** Candle flicker amplitude. */
  candle: number;
  /** Soot darkening the page edges. */
  soot: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function effectsFor(scene: Scene): InkEffects {
  const danger = clamp01(scene.danger);
  const peakPressure = scene.pressure.reduce((max, track) => Math.max(max, track.value), 0);
  const pressure = clamp01(peakPressure / 3);
  const inQuest = scene.phase === "quest";
  return {
    snowDensity: clamp01(0.22 * (1 - 0.7 * danger) + (inQuest ? 0.06 : 0)),
    emberDensity: clamp01((danger - 0.15) / 0.85),
    wind: clamp01(0.3 + 0.4 * danger),
    inkRun: scene.ending?.death ? 1 : 0,
    candle: inQuest ? 0.8 : 0.5,
    soot: clamp01(0.15 + 0.5 * pressure + 0.3 * danger),
  };
}
