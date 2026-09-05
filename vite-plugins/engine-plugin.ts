/**
 * Vite plugin that links the zork-unlimited engine from a sibling checkout.
 *
 * - alias `@zork/*`  → `<engine>/src/*` (the engine's browser-safe modules)
 * - alias `@zork-adapter` → the live adapter when the engine is present, else a stub
 * - virtual module `virtual:zork-content` → overworld JSON + quest YAML as strings
 * - define `__ENGINE_AVAILABLE__`
 *
 * The engine is never copied into this repo; this plugin is the whole boundary.
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Plugin } from "vite";
import { engineLinked } from "../scripts/engine-path.mjs";

const VIRTUAL_ID = "virtual:zork-content";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;

export function zorkEnginePlugin(): Plugin {
  const status = engineLinked();
  const repoRoot = resolve(import.meta.dirname, "..");
  const adapterPath = status.linked ? status.adapter : resolve(repoRoot, "packages/core/src/zork/adapter.stub.ts");

  return {
    name: "hui:zork-engine",
    config() {
      return {
        define: {
          __ENGINE_AVAILABLE__: JSON.stringify(status.linked),
          __ENGINE_ROOT__: JSON.stringify(status.linked ? status.root : ""),
        },
        resolve: {
          alias: [
            { find: /^@zork\/(.*)$/, replacement: `${status.root.replaceAll("\\", "/")}/src/$1` },
            { find: "@zork-adapter", replacement: adapterPath },
          ],
        },
        server: {
          fs: { allow: [repoRoot, status.root] },
        },
        optimizeDeps: {
          include: ["zod", "yaml"],
        },
      };
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      if (!status.linked) {
        return `export const available = false;\nexport const overworld = "";\nexport const packs = [];\n`;
      }
      const overworld = readFileSync(status.overworld, "utf8");
      const packs = status.packs.map((file) => ({
        path: `content/rpg/quests/${basename(file)}`,
        source: readFileSync(file, "utf8"),
      }));
      return [
        "export const available = true;",
        `export const overworld = ${JSON.stringify(overworld)};`,
        `export const packs = ${JSON.stringify(packs)};`,
      ].join("\n");
    },
  };
}
