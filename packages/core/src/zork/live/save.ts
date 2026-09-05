/**
 * Browser journey save, byte-compatible with the engine UI's own format
 * (`adventureforge:new-york-journey:v2`): a road-phase snapshot, or a quest
 * phase holding the pre-quest world, the accepted action trail, a
 * content-bound quest save and the world hash the trail must reproduce.
 * Restore replays the trail and fails closed on any mismatch.
 */
import type { OverworldManifest } from "@zork/world/overworld.js";
import { OverworldSession, type OverworldSessionSnapshot } from "@zork/world/session.js";
import type { OverworldQuestView } from "@zork/world/session_local_discovery.js";
import { packSourceFor, type ParsedContent } from "./content.ts";
import { QuestSession } from "./quest-session.ts";

export const LEGACY_SAVE_KEY = "adventureforge:new-york-overworld:v1";
export const JOURNEY_SAVE_KEY = "adventureforge:new-york-journey:v2";
export const BROWSER_QUEST_SEED = 1;
const SAVE_VERSION = 2;

export type TrailEntry = { kind: "quest"; actionId: string } | { kind: "journey"; choice: "continue" | "end" };

export interface ActiveQuestSave {
  questId: string;
  approachId: string | null;
  preQuestWorld: OverworldSessionSnapshot;
  trail: TrailEntry[];
}

export interface InitialJourney {
  session: OverworldSession;
  origin: "new" | "resume" | "blocked";
  notice: string | null;
  quest: QuestSession | null;
  activeQuest: OverworldQuestView | null;
  activeSave: ActiveQuestSave | null;
  recoveryError: string | null;
  storageAvailable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTrail(value: unknown): TrailEntry[] {
  if (!Array.isArray(value)) throw new Error("The saved quest trail is not a list.");
  return value.map((entry): TrailEntry => {
    if (!isRecord(entry)) throw new Error("The saved quest trail holds an invalid entry.");
    if (entry.kind === "quest" && typeof entry.actionId === "string" && entry.actionId.length > 0) {
      return { kind: "quest", actionId: entry.actionId };
    }
    if (entry.kind === "journey" && (entry.choice === "continue" || entry.choice === "end")) {
      return { kind: "journey", choice: entry.choice };
    }
    throw new Error("The saved quest trail holds an invalid entry.");
  });
}

function fresh(manifest: OverworldManifest, notice: string | null, storageAvailable: boolean): InitialJourney {
  return {
    session: new OverworldSession(manifest),
    origin: "new",
    notice,
    quest: null,
    activeQuest: null,
    activeSave: null,
    recoveryError: null,
    storageAvailable,
  };
}

export function loadJourney(content: ParsedContent, storage: Storage | null): InitialJourney {
  const { manifest } = content;
  if (!storage) return fresh(manifest, "Browser saving is unavailable. Keep this tab open to avoid losing progress.", false);
  let raw: string | null;
  try {
    raw = storage.getItem(JOURNEY_SAVE_KEY) ?? storage.getItem(LEGACY_SAVE_KEY);
  } catch {
    return fresh(manifest, "Browser saving is unavailable. Keep this tab open to avoid losing progress.", false);
  }
  if (raw === null) return fresh(manifest, null, true);

  try {
    const decoded: unknown = JSON.parse(raw);
    if (!isRecord(decoded) || !("browserSaveVersion" in decoded)) {
      const session = OverworldSession.restore(manifest, decoded);
      const warnings = session.restoreWarnings();
      return { ...fresh(manifest, warnings.length ? `Warning: ${warnings.join(" ")}` : null, true), session, origin: "resume" };
    }
    if (decoded.browserSaveVersion !== SAVE_VERSION) throw new Error("This save was written by an unknown version.");
    if (decoded.phase === "road") {
      const session = OverworldSession.restore(manifest, decoded.world);
      const warnings = session.restoreWarnings();
      return { ...fresh(manifest, warnings.length ? `Warning: ${warnings.join(" ")}` : null, true), session, origin: "resume" };
    }
    if (decoded.phase !== "quest") throw new Error("This save names an unknown phase.");
    const questId = decoded.questId;
    const approachId = decoded.approachId;
    const questSave = decoded.questSave;
    const worldSnapshotHash = decoded.worldSnapshotHash;
    if (typeof questId !== "string" || (approachId !== null && typeof approachId !== "string")) throw new Error("The saved quest is malformed.");
    if (typeof questSave !== "string" || typeof worldSnapshotHash !== "string") throw new Error("The saved quest is malformed.");
    const trail = parseTrail(decoded.trail);

    const session = OverworldSession.restore(manifest, decoded.preQuestWorld);
    const canonicalPreQuestWorld = session.snapshot();
    const pack = packSourceFor(content, questId);
    if (!pack) throw new Error(`Quest pack is missing for saved quest ${JSON.stringify(questId)}.`);
    const plan = session.prepareQuestStart(questId, approachId === null ? undefined : approachId);
    const activeQuest = session.commitQuestStart(plan);
    const launchCharacter = session.questLaunchCharacterState(questId);
    if (!launchCharacter) throw new Error("This quest save is missing its starting character.");
    const restored = QuestSession.restoreEmbedded(
      pack.source,
      questId,
      launchCharacter,
      pack.quest.campaign_imports,
      BROWSER_QUEST_SEED,
      trail.flatMap((entry) => (entry.kind === "quest" ? [entry.actionId] : [])),
      questSave,
    );
    let decisionIndex = 0;
    for (const entry of trail) {
      if (entry.kind === "journey") {
        session.chooseJourney(entry.choice);
        continue;
      }
      const decision = restored.decisions[decisionIndex++];
      if (!decision || decision.actionId !== entry.actionId) throw new Error("The saved quest's recorded actions do not agree.");
      session.recordQuestDecision(decision.actionId, decision.classification, decision.checkpointSafeBoundary);
    }
    if (decisionIndex !== restored.decisions.length) throw new Error("The saved quest has extra recorded actions.");
    if (session.snapshotHash() !== worldSnapshotHash) throw new Error("The saved journey does not match the quest's recorded actions.");

    const ending = restored.session.ending();
    if (ending) {
      if (ending.death) session.recordQuestCharacterDeath(questId, { endingId: ending.id, death: true });
      else session.completeQuest(questId, { endingId: ending.id, endingTitle: ending.title, death: false });
      return {
        ...fresh(manifest, null, true),
        session,
        origin: "resume",
        notice: ending.death
          ? `Recovered ${activeQuest.title}'s final scene. Your character died there.`
          : `Recovered and completed ${activeQuest.title}. Its journey results were verified.`,
      };
    }
    return {
      session,
      origin: "resume",
      notice: `Resumed ${activeQuest.title} at ${restored.session.view().title}. The saved quest and journey record were verified.`,
      quest: restored.session,
      activeQuest,
      activeSave: { questId, approachId, preQuestWorld: canonicalPreQuestWorld, trail: trail.map((entry) => ({ ...entry })) },
      recoveryError: null,
      storageAvailable: true,
    };
  } catch (error) {
    return {
      ...fresh(manifest, null, true),
      origin: "blocked",
      recoveryError: `This save could not be verified: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function persistRoad(storage: Storage | null, session: OverworldSession): boolean {
  if (!storage) return false;
  try {
    storage.setItem(JOURNEY_SAVE_KEY, JSON.stringify({ browserSaveVersion: SAVE_VERSION, phase: "road", world: session.snapshot() }));
    storage.removeItem(LEGACY_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function persistQuest(storage: Storage | null, session: OverworldSession, quest: QuestSession, active: ActiveQuestSave): boolean {
  if (!storage) return false;
  try {
    storage.setItem(
      JOURNEY_SAVE_KEY,
      JSON.stringify({
        browserSaveVersion: SAVE_VERSION,
        phase: "quest",
        questId: active.questId,
        approachId: active.approachId,
        preQuestWorld: active.preQuestWorld,
        trail: active.trail,
        questSave: quest.saveEmbedded(active.questId),
        worldSnapshotHash: session.snapshotHash(),
      }),
    );
    storage.removeItem(LEGACY_SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearJourney(storage: Storage | null): void {
  try {
    storage?.removeItem(JOURNEY_SAVE_KEY);
    storage?.removeItem(LEGACY_SAVE_KEY);
  } catch {
    // Storage may be blocked; the in-memory session still resets.
  }
}
