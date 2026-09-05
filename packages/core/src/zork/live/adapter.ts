import { available as contentAvailable, overworld, packs } from "virtual:zork-content";
import type { GameClient } from "../../client.ts";
import { createZorkClient } from "./zork-client.ts";

/** The live engine, compiled into the page by the Vite plugin. */
export const available = contentAvailable;

export function createLiveClient(storage: Storage | null): GameClient {
  if (!contentAvailable) throw new Error("The zork-unlimited content was not bundled. Set ZORK_UNLIMITED_PATH and rebuild.");
  return createZorkClient({ overworld, packs }, storage);
}
