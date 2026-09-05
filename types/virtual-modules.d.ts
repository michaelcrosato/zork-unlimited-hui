declare const __ENGINE_AVAILABLE__: boolean;
declare const __ENGINE_ROOT__: string;

declare module "virtual:zork-content" {
  export const available: boolean;
  export const overworld: string;
  export const packs: { path: string; source: string }[];
}

declare module "virtual:hui-gallery" {
  export const uis: {
    slug: string;
    title: string;
    tagline: string;
    techniques: string[];
    accent: string;
  }[];
}

declare module "*.wgsl?raw" {
  const source: string;
  export default source;
}

declare module "@zork-adapter" {
  import type { GameClient } from "@hui/core";
  export const available: boolean;
  export function createLiveClient(storage: Storage | null): GameClient;
}
