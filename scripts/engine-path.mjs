// Resolve where the zork-unlimited engine lives and whether it is usable.
// Shared by vite.config.ts (via dynamic import) and the CLI `pnpm engine:where`.
import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

/** Absolute engine root from ZORK_UNLIMITED_PATH or the default sibling checkout. */
export function engineRoot() {
  const raw = process.env.ZORK_UNLIMITED_PATH ?? "../zork-unlimited";
  return resolve(here, "..", raw);
}

/**
 * The engine is "present" when its browser-safe source and the shipped content
 * both exist. A partial checkout is treated as absent so the build falls back
 * to the mock client instead of failing half way through module resolution.
 */
export function engineStatus() {
  const root = engineRoot();
  const src = join(root, "src", "world", "session.ts");
  const overworld = join(root, "content", "world", "new_york_overworld.json");
  const questsDir = join(root, "content", "rpg", "quests");
  const present = existsSync(src) && existsSync(overworld) && existsSync(questsDir);
  const packs = present
    ? readdirSync(questsDir)
        .filter((name) => name.endsWith(".yaml"))
        .sort()
        .map((name) => join(questsDir, name))
    : [];
  return { root, present, overworld, packs };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const status = engineStatus();
  console.log(JSON.stringify(status, null, 2));
  process.exit(status.present ? 0 : 1);
}
