import type { GameClient } from "@hui/core";

export interface HooksInit {
  ui: string;
  client: GameClient;
  sample: () => Promise<HuiSample>;
}

/** The `window.__hui` object plus the shell-side controls that feed it. */
export interface Hooks extends HuiHooks {
  markFrame(nowMs: number): void;
  setReady(): void;
  fail(message: string): void;
}

export function createHooks(init: HooksInit): Hooks {
  const stamps: number[] = [];
  const hooks: Hooks = {
    ready: false,
    ui: init.ui,
    client: init.client.kind,
    frames: 0,
    fps: 0,
    error: null,
    scene: () => init.client.scene(),
    act: (id) => init.client.act(id),
    sample: init.sample,
    markFrame(now) {
      hooks.frames += 1;
      stamps.push(now);
      while (stamps.length > 0 && stamps[0]! < now - 1000) stamps.shift();
      const first = stamps[0];
      hooks.fps = stamps.length > 1 && first !== undefined && now > first ? ((stamps.length - 1) * 1000) / (now - first) : 0;
    },
    setReady() {
      hooks.ready = true;
    },
    fail(message) {
      hooks.error = message;
    },
  };
  return hooks;
}
