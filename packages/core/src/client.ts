import type { Scene } from "./scene.ts";

export interface ActResult {
  ok: boolean;
  /** Player-readable outcome or rejection reason. */
  message: string;
}

/**
 * The only door between an interface and a game. Synchronous on purpose: the
 * engine is a pure reducer, so an action either applies or is rejected before
 * the call returns.
 */
export interface GameClient {
  readonly kind: "mock" | "live";
  scene(): Scene;
  act(id: string): ActResult;
  /** Fires after every accepted action and after reset. Returns an unsubscribe. */
  subscribe(listener: (scene: Scene) => void): () => void;
  reset(): void;
}

/** Small listener registry shared by client implementations. */
export class SceneStore {
  private readonly listeners = new Set<(scene: Scene) => void>();

  subscribe(listener: (scene: Scene) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(scene: Scene): void {
    for (const listener of [...this.listeners]) listener(scene);
  }
}
