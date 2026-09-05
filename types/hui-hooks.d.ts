import type { ActResult, Scene } from "@hui/core";

declare global {
  interface HuiSample {
    /** True when at least two pixels in the sampled region differ. */
    nonBlank: boolean;
    /** Number of distinct quantized colours in the sampled region. */
    distinct: number;
    width: number;
    height: number;
  }

  /** Test and automation hooks every interface exposes through the shell. */
  interface HuiHooks {
    ready: boolean;
    ui: string;
    client: "mock" | "live";
    frames: number;
    /** Rolling average over the last second. */
    fps: number;
    scene(): Scene;
    act(id: string): ActResult;
    sample(): Promise<HuiSample>;
    error: string | null;
    /** Read-only cinematic state; actual rolls come from the accepted engine action. */
    presentation?(): {
      beat: string; age: number; transition: number; impact: number; progress: number; seed: number;
      combat: boolean; revealed: boolean; rolls: import("@hui/core").DiceRoll[];
      particles: number; mode: "paint" | "energy"; reducedMotion: boolean;
    };
    /** Read-only CSS-pixel geometry from interfaces with scrolling GPU panels. */
    layout?(): {
      panels: { id: string; x: number; y: number; width: number; height: number; scroll: number; maxScroll: number }[];
      actions: { id: string; x: number; y: number; width: number; height: number; disabled: boolean }[];
    };
  }

  interface Window {
    __hui?: HuiHooks;
  }
}

export {};
