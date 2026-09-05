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
  }

  interface Window {
    __hui?: HuiHooks;
  }
}

export {};
