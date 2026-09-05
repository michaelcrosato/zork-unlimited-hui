/**
 * The zork-unlimited GameClient: owns the overworld session, the embedded
 * quest session, story and journey pauses, and the verified browser save.
 * A DOM-free port of the orchestration in the engine UI's `App.tsx` (MIT),
 * emitting the shared Scene instead of React elements.
 */
import { FRESH_GAME_TUTORIAL } from "@zork/world/fresh_game_tutorial.js";
import { timeLabel } from "@zork/world/session_journal_codec.js";
import { embeddedLaunchOverlayForPlan } from "@zork/world/embedded_launch_overlay.js";
import type { JourneyChoice, JourneyStoryChoicePrompt } from "@zork/world/journey_contract.js";
import {
  OverworldSession,
  type OverworldActionResult,
  type OverworldRoadEncounterResult,
  type OverworldServiceResult,
} from "@zork/world/session.js";
import type { OverworldQuestView } from "@zork/world/session_local_discovery.js";
import { SceneStore, type ActResult, type GameClient } from "../../client.ts";
import { humanizeId } from "../../humanize.ts";
import type { Action, Scene, Vitals } from "../../scene.ts";
import { packSourceFor, parseZorkContent, type ParsedContent, type ZorkContent } from "./content.ts";
import { questAction } from "./labels.ts";
import { buildOverworldActions } from "./overworld-actions.ts";
import { QuestSession } from "./quest-session.ts";
import { BROWSER_QUEST_SEED, clearJourney, loadJourney, persistQuest, persistRoad, type ActiveQuestSave } from "./save.ts";
import { presentJourneyChoice, presentStoryChoice } from "./story-scene.ts";
import { diceFromNarrations, type Presentation } from "../../presentation.ts";
import { buildWorldGraph } from "./world-graph.ts";

type Runner = () => void;

class ZorkClient implements GameClient {
  readonly kind = "live" as const;
  private readonly store = new SceneStore();
  private readonly content: ParsedContent;
  private world: OverworldSession;
  private quest: QuestSession | null;
  private activeQuest: OverworldQuestView | null;
  private activeSave: ActiveQuestSave | null;
  private tutorialOpen: boolean;
  private inspectedStory: JourneyStoryChoicePrompt | null = null;
  private recoveryError: string | null;
  private storageAvailable: boolean;
  private saveStatus: Scene["saveStatus"];
  private log: string[];
  private registry = new Map<string, Runner>();
  private cached: Scene | null = null;
  private presentation: Presentation | undefined;
  private presentationSequence = 0;
  private actionNarrations: string[] = [];

  constructor(
    content: ZorkContent,
    private readonly storage: Storage | null,
  ) {
    this.content = parseZorkContent(content);
    const initial = loadJourney(this.content, storage);
    this.world = initial.session;
    this.quest = initial.quest;
    this.activeQuest = initial.activeQuest;
    this.activeSave = initial.activeSave;
    this.tutorialOpen = initial.origin === "new";
    this.recoveryError = initial.recoveryError;
    this.storageAvailable = initial.storageAvailable;
    this.saveStatus = !initial.storageAvailable ? "unavailable" : initial.origin === "resume" ? "saved" : "pending";
    const town = this.world.view().current.name;
    const opener =
      initial.origin === "resume" ? (initial.notice ?? `Resumed in ${town}.`) : `You begin in ${town}. Scout or talk to find local work, or take a known road.`;
    this.log = initial.notice && initial.notice !== opener ? [initial.notice, opener] : [opener];
    if (this.quest === null && this.recoveryError === null && this.storageAvailable) {
      this.saveStatus = persistRoad(storage, this.world) ? "saved" : "unavailable";
    }
  }

  scene(): Scene {
    if (!this.cached) this.cached = this.build();
    return this.cached;
  }

  subscribe(listener: (scene: Scene) => void): () => void {
    return this.store.subscribe(listener);
  }

  reset(): void {
    this.presentation = undefined;
    this.startNewJourney();
    this.invalidate();
    this.store.emit(this.scene());
  }

  act(id: string): ActResult {
    const prior = this.scene();
    const action = prior.actions.find(a => a.id === id);
    if (action?.disabledReason) return { ok: false, message: action.disabledReason };
    const run = this.registry.get(id);
    if (!run) return { ok: false, message: "That action is not available." };
    this.actionNarrations = [];
    const before = this.log[0];
    try {
      run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.invalidate();
      return { ok: false, message: `Could not continue: ${message}` };
    }
    this.invalidate();
    const damageTaken = Math.max(0, prior.vitals.hp - this.scene().vitals.hp);
    const narrations = [...this.actionNarrations];
    this.presentation = action ? { sequence: ++this.presentationSequence, actionId: id, label: action.label, kind: action.kind,
      narrations, rolls: diceFromNarrations(narrations), damageTaken } : undefined;
    this.invalidate();
    this.store.emit(this.scene());
    return { ok: true, message: this.log[0] !== before ? (this.log[0] ?? "") : this.scene().result };
  }

  private invalidate(): void {
    this.cached = null;
    this.registry = new Map();
  }

  private register = (id: string, run: Runner): void => {
    this.registry.set(id, run);
  };

  private note(line: string): void {
    this.log = [line, ...this.log].slice(0, 60);
  }

  private saveRoad(): void {
    this.saveStatus = this.storageAvailable && persistRoad(this.storage, this.world) ? "saved" : "unavailable";
  }

  private saveQuest(): void {
    if (!this.quest || !this.activeSave) return;
    this.saveStatus = this.storageAvailable && persistQuest(this.storage, this.world, this.quest, this.activeSave) ? "saved" : "unavailable";
  }

  // ---- overworld handlers --------------------------------------------------

  private travel(edgeId: string): void {
    const entry = this.world.travel(edgeId);
    const roadEvent = entry.roadEvent ? ` Road encounter: ${entry.roadEvent.title} — ${entry.roadEvent.summary}` : "";
    this.note(
      `You travel ${entry.distanceMi.toFixed(1)} miles on ${entry.route} to ${entry.to}. Time ${entry.baseMinutes} min${entry.delayMinutes > 0 ? ` + ${entry.delayMinutes} min delay` : ""}; supplies -${entry.suppliesUsed}; fatigue +${entry.fatigueGained}.${roadEvent}`,
    );
    this.saveRoad();
  }

  private followGoal(): void {
    const result = this.world.followGoalPassage();
    const first = result.legs[0];
    const arrivals = result.legs.map((leg) => leg.to);
    const last = arrivals.at(-1);
    const montage = !first || !last ? `You remain at ${result.stoppedAt}.` : arrivals.length === 1 ? `You travel from ${first.from} to ${last}.` : `You travel from ${first.from}, through ${arrivals.slice(0, -1).join(", ")}, to ${last}.`;
    const stop =
      result.stopReason === "objective"
        ? "You have reached the objective town."
        : result.stopReason === "road_encounter"
          ? "A road encounter stops you. Choose a response."
          : "You stop before another road would cause a supply shortage or worsen your condition.";
    this.note(
      `${montage} Roads: ${result.legs.length}. Time ${result.baseMinutes} min${result.delayMinutes > 0 ? `, +${result.delayMinutes} min delay` : ""}. Supplies -${result.suppliesUsed}, ${result.suppliesAfter} left. Fatigue +${result.fatigueGained} to ${result.fatigueAfter}; condition ${result.travelConditionAfter}. ${stop}`,
    );
    this.saveRoad();
  }

  private moveArea(routeId: string): void {
    const result = this.world.moveArea(routeId);
    this.note(`You walk to ${result.to.name}. Time ${result.minutes} min.`);
    this.saveRoad();
  }

  private runWorld(run: () => unknown): void {
    const result = run() as OverworldActionResult;
    const leads = [
      result.discoveredAreas?.length ? ` New area mapped: ${result.discoveredAreas.map((area) => area.name).join(", ")}.` : "",
      result.discoveredJobs?.length ? ` New local job posted: ${result.discoveredJobs.map((job) => job.title).join(", ")}.` : "",
      result.discoveredQuests?.length ? ` New work posted: ${result.discoveredQuests.map((quest) => quest.title).join(", ")}.` : "",
    ].join("");
    this.note(result.alreadyKnown ? `${result.entry.title}: ${result.entry.text}` : `${result.entry.title}: ${result.entry.text} (${result.minutes} min)${leads}`);
    this.saveRoad();
  }

  private runService(run: () => unknown): void {
    const result = run() as OverworldServiceResult;
    this.note(result.changed ? `${result.message} (${result.minutes} min)` : result.message);
    this.saveRoad();
  }

  private runEncounter(run: () => unknown): void {
    const result = run() as OverworldRoadEncounterResult;
    this.note(
      `${result.entry.title}. ${result.entry.text} Time +${result.minutes} min; supplies -${result.suppliesUsed}; fatigue +${result.fatigueGained}${result.renownGained > 0 ? `; renown +${result.renownGained}` : ""}.`,
    );
    this.saveRoad();
  }

  private startQuest(quest: OverworldQuestView, approachId?: string): void {
    const pack = packSourceFor(this.content, quest.id);
    if (!pack) throw new Error(`Quest pack is missing: ${quest.id}`);
    const preQuestWorld = this.world.snapshot();
    const plan = this.world.prepareQuestStart(quest.id, approachId);
    const launchOverlay = embeddedLaunchOverlayForPlan(plan, "ui-journey");
    const session = QuestSession.startEmbedded(pack.source, plan.characterAfter, pack.quest.campaign_imports, BROWSER_QUEST_SEED, launchOverlay);
    const localQuest = this.world.commitQuestStart(plan);
    const approach = localQuest.launch?.options.find((option) => option.id === localQuest.launch?.selected?.optionId);
    this.quest = session;
    this.activeQuest = localQuest;
    this.activeSave = { questId: localQuest.id, approachId: plan.approachId, preQuestWorld, trail: [] };
    this.saveQuest();
    this.note(`Started ${localQuest.title}${approach ? ` by ${approach.title}` : ""}.`);
  }

  // ---- quest ------------------------------------------------------------------

  private chooseQuest(id: string, label: string): void {
    if (!this.quest || !this.activeSave || !this.activeQuest) return;
    const outcome = this.quest.choose(id);
    this.actionNarrations = outcome.narration;
    const view = this.quest.view();
    const lines = [`> ${label}`, ...outcome.narration, ...(outcome.rejection ? [`(${outcome.rejection})`] : [])];
    if (outcome.ok) {
      if (outcome.journeyActionId === null) throw new Error("Accepted quest action has no id.");
      this.world.recordQuestDecision(outcome.journeyActionId, outcome.journeyDecision, this.quest.isCheckpointSafeBoundary());
      this.activeSave = { ...this.activeSave, trail: [...this.activeSave.trail, { kind: "quest", actionId: outcome.journeyActionId }] };
      this.saveQuest();
    }
    if (view.ended) {
      const ending = this.quest.ending();
      if (ending && !ending.death) {
        const result = this.world.completeQuest(this.activeQuest.id, { endingId: ending.id, endingTitle: ending.title, death: false });
        this.activeSave = null;
        this.saveRoad();
        lines.unshift(`Completed ${result.quest.title}: ${result.entry.text}`);
      } else if (ending?.death) {
        this.world.recordQuestCharacterDeath(this.activeQuest.id, { endingId: ending.id, death: true });
        this.activeSave = null;
        this.saveRoad();
        lines.unshift(`Your character died in ${this.activeQuest.title}. End this journey; its unfinished goal will remain in the record.`);
      }
    }
    this.log = [...lines, ...this.log].slice(0, 60);
  }

  private returnToRoad(): void {
    const view = this.world.view();
    const journey = this.world.journey();
    if (this.activeQuest && !view.completedQuestIds.includes(this.activeQuest.id) && journey.pendingChoice?.reasons.includes("character_died") !== true) {
      throw new Error("The quest result was not saved to the journey. The quest must remain open.");
    }
    this.quest = null;
    this.activeQuest = null;
    this.activeSave = null;
    this.saveRoad();
    this.note(`Returned to ${view.current.name}.`);
  }

  // ---- journey and story ------------------------------------------------------

  private chooseJourney(choice: JourneyChoice): void {
    const option = this.world.journey().pendingChoice?.options.find((candidate) => candidate.id === choice);
    this.world.chooseJourney(choice);
    if (this.quest && this.activeSave) {
      this.activeSave = { ...this.activeSave, trail: [...this.activeSave.trail, { kind: "journey", choice }] };
      this.saveQuest();
    } else {
      this.saveRoad();
    }
    if (option) this.note(option.consequence);
  }

  private chooseStory(optionId: string): void {
    const prompt = this.inspectedStory ?? this.world.journey().storyChoice;
    const result = this.world.chooseJourneyStory(optionId, this.inspectedStory?.id);
    this.inspectedStory = null;
    if (result.displaySummary) {
      this.note(`${result.displaySummary} Current goal: ${result.goal.text}`);
    } else {
      const prefix =
        prompt?.kind === "registration"
          ? "Background chosen"
          : prompt?.kind === "lead_source"
            ? "Report chosen"
            : prompt?.kind === "preparation"
              ? "Field kit chosen"
              : prompt?.kind === "ally"
                ? "Riding choice made"
                : prompt?.kind === "relief_allocation"
                  ? "Relief wagon choice made"
                  : prompt?.kind === "relief_oath"
                    ? "Promise chosen"
                    : "Choice made";
      this.note(`${prefix}: ${result.consequence} Current goal: ${result.goal.text}`);
    }
    this.saveRoad();
  }

  private revealStory(storyChoiceId: string, revealId: string): void {
    const story = this.world.revealJourneyStory(storyChoiceId, revealId);
    if (this.inspectedStory?.id === storyChoiceId) this.inspectedStory = story;
    this.saveRoad();
  }

  private startNewJourney(): void {
    this.world = new OverworldSession(this.content.manifest);
    clearJourney(this.storage);
    this.quest = null;
    this.activeQuest = null;
    this.activeSave = null;
    this.inspectedStory = null;
    this.recoveryError = null;
    this.tutorialOpen = true;
    this.saveStatus = this.storageAvailable ? "pending" : "unavailable";
    this.log = [`Started a new journey in ${this.world.view().current.name}. Scout or talk to find local work, or take a known road.`];
  }

  // ---- scene ----------------------------------------------------------------------

  private vitalsFrom(view: ReturnType<OverworldSession["view"]>, questHp?: { hp: number; hpMax: number | null }): Vitals {
    const match = /day\s+(\d+),\s*(\d{1,2}:\d{2})/i.exec(view.timeLabel);
    return {
      day: match ? Number(match[1]) : 1,
      time: match?.[2] ?? view.timeLabel,
      hp: questHp ? questHp.hp : view.character.health.current,
      hpMax: questHp ? questHp.hpMax : view.character.health.max,
      supplies: view.supplies,
      suppliesMax: view.maxSupplies,
      fatigue: view.fatigue,
      condition: view.travelCondition,
      money: view.character.money,
    };
  }

  private build(): Scene {
    this.registry = new Map();
    const view = this.world.view();
    const journey = this.world.journey();
    const town = view.current;
    const base = {
      ...(this.presentation ? { presentation: this.presentation } : {}),
      journal: this.log,
      saveStatus: this.saveStatus,
      goal: {
        text: journey.goal.text,
        guidance: journey.goalGuidance,
        status: journey.goal.status === "completed" ? ("completed" as const) : ("active" as const),
      },
      vitals: this.vitalsFrom(view),
      pressure: [] as Scene["pressure"],
      world: null as Scene["world"],
      dialogue: null as Scene["dialogue"],
      danger: 0.05,
      ending: null as Scene["ending"],
      result: this.presentation?.narrations.length ? this.presentation.narrations.join("\n\n") : this.log[0] ?? `You are in ${town.name}.`,
    };

    if (this.recoveryError) {
      this.register("meta:new-journey", () => this.startNewJourney());
      return {
        ...base,
        sceneId: "recovery",
        phase: "recovery",
        place: { id: "recovery", name: "Your saved journey was not changed", kicker: "Save could not load", context: town.name },
        prose: [this.recoveryError, "The saved data no longer matches the current game or its action record. It was not replaced with an older checkpoint."],
        actions: [{ id: "meta:new-journey", label: "Discard this save and begin a new journey", kind: "meta", group: "Journey", primary: true }],
      };
    }

    if (this.tutorialOpen) {
      this.register("meta:start", () => {
        this.tutorialOpen = false;
      });
      return {
        ...base,
        sceneId: "tutorial",
        phase: "tutorial",
        place: { id: "tutorial", name: FRESH_GAME_TUTORIAL.title, kicker: FRESH_GAME_TUTORIAL.kicker, context: town.name },
        prose: [FRESH_GAME_TUTORIAL.goal, ...FRESH_GAME_TUTORIAL.steps.map((step) => `${step.title}: ${step.text}`)],
        actions: [{ id: "meta:start", label: FRESH_GAME_TUTORIAL.start_label, kind: "meta", group: "Journey", primary: true }],
      };
    }

    if (journey.pendingChoice) {
      const presentation = presentJourneyChoice(journey.pendingChoice, this.register, (choice) => this.chooseJourney(choice));
      return {
        ...base,
        sceneId: `journey:${journey.pendingChoice.atDecision}`,
        phase: "journey_choice",
        place: { id: town.id, name: presentation.title, kicker: presentation.kicker, context: town.name },
        prose: presentation.prose,
        actions: presentation.actions,
        danger: journey.pendingChoice.reasons.includes("character_died") ? 1 : 0.05,
      };
    }

    const storyPrompt = this.inspectedStory ?? journey.storyChoice;
    if (storyPrompt) {
      const visible = this.world.journeyStoryOptionsForPresentation(storyPrompt.id);
      const presentation = presentStoryChoice(storyPrompt, visible, this.inspectedStory !== null, this.register, {
        choose: (optionId) => this.chooseStory(optionId),
        reveal: (revealId) => this.revealStory(storyPrompt.id, revealId),
        dismiss: () => {
          this.inspectedStory = null;
        },
      });
      return {
        ...base,
        sceneId: `story:${storyPrompt.id}:${visible.length}`,
        phase: "story_choice",
        place: { id: town.id, name: presentation.title, kicker: presentation.kicker, context: town.name },
        prose: presentation.prose,
        actions: presentation.actions,
      };
    }

    if (journey.status === "ended") {
      this.register("meta:new-journey", () => this.startNewJourney());
      const died = journey.retentionHistory.at(-1)?.reasons.includes("character_died") === true;
      return {
        ...base,
        sceneId: "ended",
        phase: "ended",
        place: { id: "ended", name: "This journey has ended", kicker: "Journey record", context: town.name },
        prose: [
          died
            ? `Your character died after ${journey.acceptedDecisions} decisions. The unfinished goal and journey history remain in the record.`
            : `You ended this journey after ${journey.acceptedDecisions} decisions. Its record remains.`,
          `Goal: ${journey.goal.text} — ${journey.goal.status === "completed" ? "completed" : "in progress"}.`,
        ],
        actions: [{ id: "meta:new-journey", label: "Begin a new journey", kind: "meta", group: "Journey", primary: true }],
      };
    }

    if (this.quest && this.activeQuest) return this.buildQuestScene(view, base);

    const actions = buildOverworldActions({
      view,
      journey,
      manifest: this.content.manifest,
      session: this.world,
      register: this.register,
      handlers: {
        travel: (edgeId) => this.travel(edgeId),
        followGoal: () => this.followGoal(),
        startQuest: (quest, approachId) => this.startQuest(quest, approachId),
        moveArea: (routeId) => this.moveArea(routeId),
        world: (run) => this.runWorld(run),
        service: (run) => this.runService(run),
        encounter: (run) => this.runEncounter(run),
        inspectStory: (storyChoiceId) => {
          this.inspectedStory = this.world.inspectJourneyStory(storyChoiceId);
        },
      },
    });
    return {
      ...base,
      sceneId: `overworld:${town.id}:${view.currentArea?.id ?? "center"}`,
      phase: "overworld",
      place: {
        id: town.id,
        name: town.name,
        kicker: `${town.kind.replaceAll("_", " ")} · ${town.region}`,
        context: view.currentArea?.name ?? "Town center",
      },
      prose: [town.description, view.currentArea?.summary ?? ""].filter((text) => text.length > 0),
      actions,
      world: buildWorldGraph(this.content.manifest, view),
      danger: view.pendingRoadEncounter ? 0.45 : 0.05,
    };
  }

  private buildQuestScene(view: ReturnType<OverworldSession["view"]>, base: Omit<Scene, "sceneId" | "phase" | "place" | "prose" | "actions">): Scene {
    const quest = this.quest!;
    const activeQuest = this.activeQuest!;
    const q = quest.view();
    const actions: Action[] = [];
    if (q.ended) {
      const canLeave = view.completedQuestIds.includes(activeQuest.id) || this.world.journey().pendingChoice !== null;
      this.register("meta:return", () => this.returnToRoad());
      actions.push({
        id: "meta:return",
        label: `Return to ${view.current.name}`,
        kind: "meta",
        group: "Journey",
        primary: true,
        ...(!canLeave ? { disabledReason: "The quest result must be saved before you can return." } : {}),
      });
    } else {
      for (const choice of q.choices) {
        const id = `q:${choice.id}`;
        const action = questAction(choice, id, true);
        this.register(id, () => this.chooseQuest(choice.id, action.label));
        actions.push(action);
      }
      for (const blocked of q.unavailableChoices) {
        const id = `q:${blocked.id}`;
        actions.push({
          id,
          label: blocked.command.length > 80 ? `${blocked.command.slice(0, 79)}…` : blocked.command,
          kind: "observe",
          group: "Unavailable",
          disabledReason: blocked.reason,
          primary: true,
        });
      }
    }
    const pressure = q.pressureTracks.map((track) => ({
      id: track.id,
      title: track.title,
      value: track.value,
      band: track.band.label,
      description: track.band.description ?? null,
      next: track.next ? `${track.next.label} at ${track.next.min}` : null,
    }));
    const hpMax = q.characterContinuity?.quest_local_profile.hp ?? null;
    const enemies = q.enemies.length;
    const peak = pressure.reduce((max, track) => Math.max(max, track.value), 0);
    const danger = Math.min(1, (enemies > 0 ? 0.55 : 0.08) + Math.min(0.3, peak * 0.08) + (hpMax ? (1 - q.stats.hp / hpMax) * 0.3 : 0));
    const latest = this.presentation?.narrations.length ? this.presentation.narrations.join("\n\n")
      : this.log.find((entry) => !entry.startsWith("> ")) ?? `Entered ${q.title}.`;
    const inventory = q.inventory.map(humanizeId);
    const prose = q.text.split(/\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
    if (inventory.length > 0) prose.push(`You carry: ${inventory.join(", ")}.`);
    if (q.enemies.length > 0) prose.push(`Threats here: ${q.enemies.map((enemy) => `${enemy.name} (${enemy.hp} HP)`).join(", ")}.`);
    return {
      ...base,
      sceneId: `quest:${activeQuest.id}:${q.location}${q.ended ? ":ended" : ""}`,
      phase: "quest",
      place: { id: q.location, name: q.title, kicker: activeQuest.title, context: view.current.name },
      prose,
      dialogue: q.dialogue ? { speaker: q.dialogue.npc, text: q.dialogue.text } : null,
      result: latest,
      actions,
      vitals: this.vitalsFrom(view, { hp: q.stats.hp, hpMax }),
      pressure,
      danger,
      ending: q.ending ? { title: q.ending.title, text: q.ending.text, death: q.ending.death } : null,
    };
  }
}

export function createZorkClient(content: ZorkContent, storage: Storage | null): GameClient {
  return new ZorkClient(content, storage);
}
