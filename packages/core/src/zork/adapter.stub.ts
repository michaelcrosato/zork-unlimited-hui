import type { GameClient } from "../client.ts";

/**
 * Stands in for the zork-unlimited adapter when the engine checkout is not
 * linked (CI, GitHub Pages, unit tests). The shell never calls this when
 * `__ENGINE_AVAILABLE__` is false, so reaching it is a wiring bug.
 */
export const available = false;

export function createLiveClient(_storage: Storage | null): GameClient {
  throw new Error("The zork-unlimited engine is not linked. Set ZORK_UNLIMITED_PATH and rebuild.");
}
