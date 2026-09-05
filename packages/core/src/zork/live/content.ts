import { parseOverworldManifest, type OverworldManifest, type OverworldQuest } from "@zork/world/overworld.js";

/** What the Vite plugin (or a test) hands the adapter: raw engine content. */
export interface ZorkContent {
  overworld: string;
  packs: { path: string; source: string }[];
}

export interface ParsedContent {
  manifest: OverworldManifest;
  packSourceByPath: Map<string, string>;
  questsById: Map<string, OverworldQuest>;
}

export function normalizePackPath(path: string): string {
  return path.replace(/^(\.\.\/)+/, "");
}

export function parseZorkContent(content: ZorkContent): ParsedContent {
  const manifest = parseOverworldManifest(JSON.parse(content.overworld));
  return {
    manifest,
    packSourceByPath: new Map(content.packs.map((pack) => [normalizePackPath(pack.path), pack.source])),
    questsById: new Map(manifest.quests.map((quest) => [quest.id, quest])),
  };
}

/** The pack source for a manifest quest, or null when the build did not ship it. */
export function packSourceFor(content: ParsedContent, questId: string): { quest: OverworldQuest; source: string } | null {
  const quest = content.questsById.get(questId);
  if (!quest) return null;
  const source = content.packSourceByPath.get(normalizePackPath(quest.source));
  return source === undefined ? null : { quest, source };
}
