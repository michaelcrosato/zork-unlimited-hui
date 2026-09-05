/**
 * Vite plugin that turns `uis/<slug>/ui.json` files into:
 * - multi-page build inputs (every `uis/<slug>/index.html` plus the root gallery), and
 * - the virtual module `virtual:hui-gallery` listing every UI for the gallery and shell.
 *
 * Adding a UI is adding a folder; nothing here is edited.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

export interface UiManifest {
  slug: string;
  title: string;
  tagline: string;
  techniques: string[];
  accent: string;
}

const VIRTUAL_ID = "virtual:hui-gallery";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;

export function listUis(repoRoot: string): UiManifest[] {
  const dir = join(repoRoot, "uis");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .map((entry) => entry.name)
    .filter((slug) => existsSync(join(dir, slug, "ui.json")) && existsSync(join(dir, slug, "index.html")))
    .sort()
    .map((slug) => {
      const raw = JSON.parse(readFileSync(join(dir, slug, "ui.json"), "utf8")) as Partial<UiManifest>;
      return {
        slug,
        title: raw.title ?? slug,
        tagline: raw.tagline ?? "",
        techniques: raw.techniques ?? [],
        accent: raw.accent ?? "#74cbe2",
      };
    });
}

export function galleryPlugin(): Plugin {
  const repoRoot = resolve(import.meta.dirname, "..");
  const uis = listUis(repoRoot);
  return {
    name: "hui:gallery",
    config() {
      const input: Record<string, string> = { index: resolve(repoRoot, "index.html") };
      for (const ui of uis) input[ui.slug] = resolve(repoRoot, "uis", ui.slug, "index.html");
      return { build: { rollupOptions: { input } } };
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      return `export const uis = ${JSON.stringify(uis)};`;
    },
  };
}
