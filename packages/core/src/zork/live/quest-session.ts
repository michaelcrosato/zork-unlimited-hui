/**
 * One playable quest bound to a compiled RPG pack and a live GameState.
 *
 * A port of the engine's own browser client (`ui/src/engine.ts`, MIT): it
 * compiles a pack in the browser (yaml + zod), indexes it with the RPG runner,
 * and drives the exact `step` reducer the CLI and MCP server use. Nothing here
 * decides legality; the engine's legal-action set is the only truth.
 */
import { makeStep, actionEquals, type Rules } from "@zork/core/engine.js";
import { hashState } from "@zork/core/hash.js";
import { cloneGameState, type GameState } from "@zork/core/state.js";
import type { RpgAction } from "@zork/api/types.js";
import type { GameEvent } from "@zork/core/events.js";
import { RpgPackSchema } from "@zork/rpg/schema.js";
import { CampaignCharacterImportsSchema, type CampaignCharacterImports } from "@zork/rpg/campaign_character_import.js";
import {
  indexRpgPack,
  buildRpgRules,
  initStateForRpgPack,
  enumerateRpgActions,
  isRpgCheckpointSafeBoundary,
  type RpgIndex,
} from "@zork/rpg/runner.js";
import { rpgActionOptionForInputId } from "@zork/rpg/legal_actions.js";
import { renderRpgSkillCheckDisclosure } from "@zork/rpg/player_command_projection.js";
import { parseCampaignCharacterState, type CampaignCharacterState } from "@zork/world/campaign_character_state.js";
import { buildRpgObservation, type RpgObservation } from "@zork/rpg/observation.js";
import {
  buildEmbeddedQuestCharacterContinuity,
  projectEmbeddedQuestCharacterContinuity,
  cloneEmbeddedQuestCharacterContinuity,
  type EmbeddedQuestCharacterContinuity,
} from "@zork/rpg/embedded_quest_character_continuity.js";
import { assertRpgStateReferences } from "@zork/rpg/state_integrity.js";
import type { EmbeddedLaunchOverlay } from "@zork/core/embedded_launch_overlay_receipt.js";
import { embeddedLaunchOverlayFromPersistedReceipt } from "@zork/world/embedded_launch_overlay.js";
import { SAVE_MODE, SaveIntegrityError, load, save } from "@zork/persist/save_load.js";
import { assertCampaignImportReceiptCatalogCompatibility } from "@zork/persist/campaign_import_integrity.js";
import { classifyRpgJourneyDecision, excludedJourneyDecision } from "@zork/world/journey_decision.js";
import type { JourneyDecisionClassification } from "@zork/world/journey_contract.js";
import { parse as parseYaml } from "yaml";

function compileRpgSource(source: string) {
  const raw = parseYaml(source);
  const parsed = RpgPackSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Quest pack failed schema validation: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  return { pack: parsed.data, contentHash: hashState(parsed.data) };
}

export type QuestChoice = {
  id: string;
  command: string;
  kind: RpgAction["type"];
  skillCheck?: NonNullable<RpgObservation["available_actions"][number]["skill_check"]>;
  skillDisclosure?: string;
  combat?: NonNullable<RpgObservation["available_actions"][number]["combat"]>;
  resources?: NonNullable<RpgObservation["available_actions"][number]["resources"]>;
};

export type QuestView = {
  location: string;
  title: string;
  text: string;
  dialogue: { npc: string; text: string } | null;
  choices: QuestChoice[];
  unavailableChoices: { id: string; command: string; reason: string }[];
  inventory: string[];
  stats: RpgObservation["stats"];
  score: number;
  maxScore: number;
  pressureTracks: NonNullable<RpgObservation["pressure_tracks"]>;
  visibleObjects: RpgObservation["visible_objects"];
  npcs: RpgObservation["npcs_present"];
  exits: RpgObservation["exits"];
  blockedExits: RpgObservation["blocked_exits"];
  enemies: RpgObservation["enemies_present"];
  ending: RpgObservation["ending"];
  journal: string[];
  ended: boolean;
  endingId: string | null;
  stateHash: string;
  characterContinuity?: EmbeddedQuestCharacterContinuity;
};

export type StepOutcome = {
  ok: boolean;
  narration: string[];
  rejection: string | null;
  journeyDecision: JourneyDecisionClassification;
  journeyActionId: string | null;
};

export type ReplayedQuestDecision = {
  actionId: string;
  classification: JourneyDecisionClassification;
  checkpointSafeBoundary: boolean;
};

export class QuestSession {
  readonly packId: string;
  readonly title: string;
  readonly contentHash: string;
  private readonly rules: Rules<RpgAction>;
  private readonly index: RpgIndex;
  private readonly fresh: () => GameState;
  private readonly characterContinuity: EmbeddedQuestCharacterContinuity | undefined;
  private state: GameState;

  private constructor(opts: {
    packId: string;
    title: string;
    contentHash: string;
    rules: Rules<RpgAction>;
    index: RpgIndex;
    fresh: () => GameState;
    campaignCharacter?: CampaignCharacterState;
    initialState?: GameState;
    characterContinuity?: EmbeddedQuestCharacterContinuity;
  }) {
    this.packId = opts.packId;
    this.title = opts.title;
    this.contentHash = opts.contentHash;
    this.rules = opts.rules;
    this.index = opts.index;
    this.fresh = opts.fresh;
    this.state = opts.initialState ? cloneGameState(opts.initialState) : opts.fresh();
    this.characterContinuity = opts.characterContinuity
      ? cloneEmbeddedQuestCharacterContinuity(opts.characterContinuity)
      : opts.campaignCharacter
        ? buildEmbeddedQuestCharacterContinuity({ character: opts.campaignCharacter, pack: opts.index.pack, state: this.state })
        : undefined;
  }

  /** Start a quest from a live overworld character using the quest's authored import catalog. */
  static startEmbedded(
    source: string,
    character: CampaignCharacterState,
    imports: CampaignCharacterImports | undefined,
    seed = 1,
    launchOverlay?: EmbeddedLaunchOverlay,
  ): QuestSession {
    const c = compileRpgSource(source);
    const index = indexRpgPack(c.pack);
    const characterSnapshot = parseCampaignCharacterState(character);
    const importsSnapshot = imports === undefined ? undefined : CampaignCharacterImportsSchema.parse(imports);
    return new QuestSession({
      packId: c.pack.meta.id,
      title: c.pack.meta.title,
      contentHash: c.contentHash,
      rules: buildRpgRules(index),
      index,
      fresh: () =>
        importsSnapshot === undefined
          ? initStateForRpgPack(index, seed, undefined, launchOverlay)
          : initStateForRpgPack(index, seed, { character: characterSnapshot, imports: importsSnapshot }, launchOverlay),
      campaignCharacter: characterSnapshot,
    });
  }

  /** Restore a quest only after deterministic replay proves the save belongs to this pack, launch and trail. */
  static restoreEmbedded(
    source: string,
    worldQuestId: string,
    character: CampaignCharacterState,
    imports: CampaignCharacterImports | undefined,
    expectedSeed: number,
    actionIds: readonly string[],
    savedQuest: string,
  ): { session: QuestSession; decisions: ReplayedQuestDecision[] } {
    const c = compileRpgSource(source);
    const index = indexRpgPack(c.pack);
    const characterSnapshot = parseCampaignCharacterState(character);
    const importsSnapshot = imports === undefined ? undefined : CampaignCharacterImportsSchema.parse(imports);
    const bundle = load(savedQuest, c.contentHash, SAVE_MODE);
    if (bundle.source_ref[0] !== "wq" || bundle.source_ref[1] !== worldQuestId) {
      throw new SaveIntegrityError(`This save belongs to a different quest, not ${JSON.stringify(worldQuestId)}.`);
    }
    if (bundle.state.seed !== expectedSeed) {
      throw new SaveIntegrityError(`This save uses a different quest seed than the journey (${expectedSeed}).`);
    }
    assertRpgStateReferences(index, bundle.state);
    assertCampaignImportReceiptCatalogCompatibility(bundle.state, importsSnapshot);
    const launchOverlay = embeddedLaunchOverlayFromPersistedReceipt(bundle.state.embeddedLaunchOverlayReceipt);
    const fresh = () =>
      importsSnapshot === undefined
        ? initStateForRpgPack(index, expectedSeed, undefined, launchOverlay)
        : initStateForRpgPack(index, expectedSeed, { character: characterSnapshot, imports: importsSnapshot }, launchOverlay);
    const launchState = fresh();
    const expectedContinuity = buildEmbeddedQuestCharacterContinuity({ character: characterSnapshot, pack: index.pack, state: launchState });
    const savedContinuity = bundle.embedded_character_continuity?.character_continuity;
    if (!savedContinuity) throw new SaveIntegrityError("This quest save is missing its journey character record.");
    if (hashState(savedContinuity) !== hashState(expectedContinuity)) {
      throw new SaveIntegrityError("This quest save does not match the character who started it.");
    }
    const session = new QuestSession({
      packId: c.pack.meta.id,
      title: c.pack.meta.title,
      contentHash: c.contentHash,
      rules: buildRpgRules(index),
      index,
      fresh,
      initialState: launchState,
      characterContinuity: expectedContinuity,
    });
    const decisions: ReplayedQuestDecision[] = [];
    for (const actionId of actionIds) {
      if (typeof actionId !== "string" || actionId.length === 0) {
        throw new SaveIntegrityError("This quest save contains an invalid recorded action.");
      }
      const outcome = session.choose(actionId);
      if (!outcome.ok || outcome.journeyActionId !== actionId) {
        throw new SaveIntegrityError(`The recorded action ${JSON.stringify(actionId)} cannot be replayed in this quest.`);
      }
      decisions.push({ actionId, classification: outcome.journeyDecision, checkpointSafeBoundary: session.isCheckpointSafeBoundary() });
    }
    if (session.view().stateHash !== bundle.stateHash) {
      throw new SaveIntegrityError("The saved quest state does not match its recorded actions.");
    }
    return { session, decisions };
  }

  saveEmbedded(worldQuestId: string): string {
    if (!this.characterContinuity) throw new SaveIntegrityError("Only a quest started from this journey can be saved here.");
    return save(this.state, this.contentHash, SAVE_MODE, { worldQuestId, embeddedCharacterContinuity: this.characterContinuity });
  }

  private actionFor(id: string): ReturnType<typeof enumerateRpgActions>[number] | null {
    return rpgActionOptionForInputId(enumerateRpgActions(this.index, this.state), id);
  }

  view(): QuestView {
    const o = buildRpgObservation(this.index, this.state, { includeWorldIntro: true });
    return {
      location: o.room,
      title: o.title,
      text: o.description,
      dialogue: o.dialogue
        ? { npc: o.npcs_present.find((candidate) => candidate.id === o.dialogue?.npc)?.name ?? o.dialogue.npc, text: o.dialogue.npc_text }
        : null,
      choices: o.available_actions.map((a) => ({
        id: a.id,
        command: a.command,
        kind: a.action.type,
        ...(a.skill_check ? { skillCheck: a.skill_check, skillDisclosure: renderRpgSkillCheckDisclosure(a.skill_check) } : {}),
        ...(a.combat ? { combat: a.combat } : {}),
        ...(a.resources ? { resources: { gains: [...a.resources.gains], costs: [...a.resources.costs] } } : {}),
      })),
      unavailableChoices: o.blocked_actions.map((action) => ({ id: action.id, command: action.command, reason: action.reason })),
      inventory: [...o.inventory],
      stats: { ...o.stats },
      score: o.score,
      maxScore: o.max_score,
      pressureTracks: o.pressure_tracks ? o.pressure_tracks.map((track) => ({ ...track })) : [],
      visibleObjects: o.visible_objects.map((object) => ({ ...object })),
      npcs: o.npcs_present.map((npc) => ({ ...npc })),
      exits: o.exits.map((exit) => ({ ...exit })),
      blockedExits: o.blocked_exits.map((exit) => ({ ...exit })),
      enemies: o.enemies_present.map((enemy) => ({ ...enemy })),
      ending: o.ending ? { ...o.ending } : null,
      journal: [...o.state.journal],
      ended: o.ended,
      endingId: o.ending_id,
      stateHash: hashState(this.state),
      ...(this.characterContinuity
        ? { characterContinuity: projectEmbeddedQuestCharacterContinuity({ continuity: this.characterContinuity, pack: this.index.pack, state: this.state }) }
        : {}),
    };
  }

  isCheckpointSafeBoundary(): boolean {
    return isRpgCheckpointSafeBoundary(this.index, this.state);
  }

  choose(id: string): StepOutcome {
    const option = this.actionFor(id);
    const blocked = option ? null : buildRpgObservation(this.index, this.state).blocked_actions.find((action) => action.id === id);
    if (!option || !this.rules.legalActions(this.state).some((action) => actionEquals(action, option.action))) {
      return {
        ok: false,
        narration: [],
        rejection: blocked?.reason ?? "That action is not available.",
        journeyDecision: excludedJourneyDecision("rejected"),
        journeyActionId: null,
      };
    }
    const before = this.state;
    const r = makeStep(this.rules)(this.state, option.action);
    if (r.ok) this.state = r.state;
    return {
      ok: r.ok,
      narration: narrationsOf(r.events),
      rejection: r.rejectionReason ?? null,
      journeyDecision: classifyRpgJourneyDecision({
        action: option.action,
        before,
        after: r.state,
        events: r.events,
        accepted: r.ok,
        isSkillCheck: option.skill_check !== undefined,
      }),
      journeyActionId: option.id,
    };
  }

  ending(): { id: string; title: string; death: boolean } | null {
    if (!this.state.ended || !this.state.endingId) return null;
    const ending = this.index.pack.endings.find((e) => e.id === this.state.endingId);
    return ending ? { id: ending.id, title: ending.title, death: ending.death } : null;
  }

  reset(): void {
    this.state = this.fresh();
  }
}

function narrationsOf(events: GameEvent[]): string[] {
  return events.filter((e): e is Extract<GameEvent, { type: "narration" }> => e.type === "narration").map((e) => e.text);
}
