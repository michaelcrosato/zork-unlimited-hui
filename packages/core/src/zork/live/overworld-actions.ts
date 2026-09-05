/**
 * Every legal overworld action as a Scene action. A port of the section
 * builders in the engine UI's `App.tsx` (MIT), minus React: each card becomes
 * an `Action` plus a runner the client stores against the action id.
 */
import type { JourneyPresentation } from "@zork/world/journey_contract.js";
import type { OverworldManifest, OverworldQuest } from "@zork/world/overworld.js";
import type { OverworldSession } from "@zork/world/session.js";
import type { OverworldQuestView } from "@zork/world/session_local_discovery.js";
import type { OverworldView } from "@zork/world/session_view.js";
import type { Action, ActionKind } from "../../scene.ts";
import { clipLabel } from "./labels.ts";

export interface OverworldHandlers {
  travel(edgeId: string): void;
  followGoal(): void;
  startQuest(quest: OverworldQuestView, approachId?: string): void;
  moveArea(routeId: string): void;
  world(run: () => unknown): void;
  service(run: () => unknown): void;
  encounter(run: () => unknown): void;
  inspectStory(storyChoiceId: string): void;
}

export interface OverworldActionContext {
  view: OverworldView;
  journey: JourneyPresentation;
  manifest: OverworldManifest;
  session: OverworldSession;
  handlers: OverworldHandlers;
  register: (id: string, run: () => void) => void;
}

interface Card {
  action: Omit<Action, "primary">;
  run: () => void;
  goalRelevant?: boolean;
  optionalSupport?: boolean;
}

interface Section {
  id: string;
  cards: Card[];
}

const suppliesLabel = (value: number): string => `${value} ${value === 1 ? "supply" : "supplies"}`;

function card(
  id: string,
  kind: ActionKind,
  group: string,
  title: string,
  run: () => void,
  extra: { terms?: string; consequence?: string; detail?: string; disabledReason?: string; goalRelevant?: boolean; optionalSupport?: boolean } = {},
): Card {
  const { label, detail } = clipLabel(title);
  const fullDetail = [detail, extra.detail].filter(Boolean).join(" ");
  return {
    action: {
      id,
      label,
      kind,
      group,
      ...(extra.terms ? { terms: extra.terms } : {}),
      ...(extra.consequence ? { consequence: extra.consequence } : {}),
      ...(fullDetail ? { detail: fullDetail } : {}),
      ...(extra.disabledReason ? { disabledReason: extra.disabledReason } : {}),
    },
    run,
    ...(extra.goalRelevant ? { goalRelevant: true } : {}),
    ...(extra.optionalSupport ? { optionalSupport: true } : {}),
  };
}

function normalizedGoalPhrase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function goalRelevantAreaIds(goalText: string, guidance: string | null, quests: readonly OverworldQuest[]): Set<string> {
  const copy = ` ${normalizedGoalPhrase(`${goalText} ${guidance ?? ""}`)} `;
  return new Set(
    quests
      .filter((quest) => {
        const title = normalizedGoalPhrase(quest.title).replace(/^the\s+/, "");
        return title.length > 0 && copy.includes(` ${title} `);
      })
      .map((quest) => quest.area),
  );
}

function areaName(manifest: OverworldManifest, areaId: string): string {
  return manifest.areas.find((area) => area.id === areaId)?.name ?? areaId;
}

function splitQuestNotices(view: OverworldView): { departureQuest: OverworldQuestView | null; noticeBoard: OverworldQuestView[] } {
  const departureQuestId = view.departureRecap?.questId;
  const departureQuest =
    departureQuestId && view.questStarts.some(([questId]) => questId === departureQuestId)
      ? (view.quests.find((quest) => quest.id === departureQuestId) ?? null)
      : null;
  return { departureQuest, noticeBoard: departureQuest ? view.quests.filter((quest) => quest.id !== departureQuest.id) : view.quests };
}

function questCards(ctx: OverworldActionContext, quests: readonly OverworldQuestView[], group: string): Card[] {
  const { view, manifest, handlers } = ctx;
  return quests.flatMap((quest) => {
    const area = areaName(manifest, quest.area);
    const inArea = view.currentArea?.id === quest.area;
    if (!quest.launch) {
      const projected = view.questStarts.some(([questId]) => questId === quest.id);
      return [
        card(`ow:quest:${quest.id}`, "choice", group, quest.title, () => handlers.startQuest(quest), {
          terms: `Posted in ${area}`,
          detail: quest.discovery,
          ...(!projected ? { disabledReason: inArea ? "You cannot start this now." : `Move to ${area}.` } : {}),
        }),
      ];
    }
    return quest.launch.options.map((option) => {
      const projected = view.questStarts.some(([questId, approachId]) => questId === quest.id && approachId === option.id);
      const blocked = option.projection?.blockedReason ?? (!inArea ? `Move to ${area}.` : undefined);
      const arrival =
        option.projection?.available && option.projection.suppliesAfter !== null
          ? ` · arrive with ${suppliesLabel(option.projection.suppliesAfter)}, fatigue ${option.projection.fatigueAfter}`
          : "";
      return card(`ow:quest:${quest.id}:${option.id}`, "choice", group, `${option.title} — depart for ${quest.title}`, () => handlers.startQuest(quest, option.id), {
        terms: `${option.terms.minutes} min · ${suppliesLabel(option.terms.supplies)} · fatigue +${option.terms.fatigue}${arrival}`,
        consequence: option.tradeoffSummary ?? option.consequence,
        detail: option.preview,
        ...(!projected ? { disabledReason: blocked ?? "You cannot start this now." } : {}),
      });
    });
  });
}

function buildSections(ctx: OverworldActionContext): Section[] {
  const { view, journey, manifest, session, handlers } = ctx;
  const sections: Section[] = [];

  if (view.pendingRoadEncounter) {
    const encounter = view.pendingRoadEncounter;
    sections.push({
      id: "encounter",
      cards: encounter.options.map((option) =>
        card(`ow:encounter:${option.strategy}`, "choice", "Road encounter", option.label, () => handlers.encounter(() => session.resolveRoadEncounter(option.strategy)), {
          terms: `${option.minutes} min · supplies -${option.suppliesCost} · fatigue +${option.fatigueGained}${option.renownGained > 0 ? ` · renown +${option.renownGained}` : ""}`,
          consequence: `Clears the encounter on ${encounter.route}.`,
          detail: `${encounter.event.title}: ${encounter.event.summary}`,
        }),
      ),
    });
  }

  if (journey.goalPassage) {
    const passage = journey.goalPassage;
    sections.push({
      id: "goal",
      cards: [
        card(`ow:goal:${passage.id}`, "travel", "Goal passage", passage.label, () => handlers.followGoal(), {
          terms: `To ${passage.destination} · ${passage.roadCount} ${passage.roadCount === 1 ? "road" : "roads"} · ${passage.estimatedMinutes} min · needs ${passage.suppliesNeeded} ${passage.suppliesNeeded === 1 ? "supply" : "supplies"}${passage.supplyDeficit > 0 ? ` (short ${passage.supplyDeficit})` : ""}`,
          consequence: passage.stopRule,
          detail: passage.consequence,
          goalRelevant: true,
        }),
      ],
    });
  }

  const { departureQuest, noticeBoard } = splitQuestNotices(view);
  const dispatch = questCards(ctx, departureQuest ? [departureQuest] : [], "Dispatch");
  for (const interaction of view.departureInteractions) {
    const support = view.stationDispatchBoard?.support.find(
      (candidate) => candidate.status === "open_optional" && candidate.selectedTitle === null && candidate.action?.kind === "inspect" && candidate.action.storyChoiceId === interaction.id,
    );
    dispatch.push(
      card(`ow:dispatch:${interaction.id}`, "observe", "Optional support", `Review ${interaction.title.toLowerCase()}`, () => handlers.inspectStory(interaction.id), {
        terms: support?.detailHint ?? "Review before choosing",
        detail: support?.purpose ?? `Compare the ${interaction.title.toLowerCase()} options before departure.`,
        optionalSupport: true,
      }),
    );
  }
  for (const lead of view.departureContactLeads) {
    dispatch.push(
      card(
        `ow:dispatch:${lead.id}`,
        "talk",
        "Optional support",
        `Ask ${lead.contactName} about riding`,
        () => {
          if (lead.action) handlers.world(() => session.talkToCharacter(lead.action.characterId));
        },
        {
          terms: lead.action ? `Talk with ${lead.contactName}` : "Choose a field kit first",
          detail: lead.guidance,
          optionalSupport: true,
          ...(!lead.action ? { disabledReason: `Choose a field kit before asking ${lead.contactName}.` } : {}),
        },
      ),
    );
  }
  if (dispatch.length > 0) sections.push({ id: "dispatch", cards: dispatch });

  const goalAreas = goalRelevantAreaIds(journey.goal.text, journey.goalGuidance, manifest.quests);
  const areaCards: Card[] = view.areaExits.map((exit) => {
    const goalRelevant = goalAreas.has(exit.destination.id);
    return card(`ow:area-route:${exit.id}`, "move", goalRelevant ? "Next for current goal" : "Local route", `Walk to ${exit.destination.name}`, () => handlers.moveArea(exit.id), {
      terms: `${exit.travel_minutes} min`,
      detail: exit.destination.summary,
      ...(goalRelevant ? { goalRelevant: true } : {}),
    });
  });
  for (const area of view.areas) {
    if (view.currentArea?.id !== area.id || view.visitedAreaIds.includes(area.id)) continue;
    areaCards.push(
      card(`ow:area:${area.id}`, "observe", "Explore", `Explore ${area.name}`, () => handlers.world(() => session.exploreArea(area.id)), {
        terms: `${area.travel_minutes} min on foot`,
        detail: area.summary,
      }),
    );
  }
  sections.push({ id: "areas", cards: areaCards });

  const discovery: Card[] = view.pois.map((poi) =>
    card(`ow:poi:${poi.id}`, "observe", "Scout", `Scout ${poi.title}`, () => handlers.world(() => session.scoutPoi(poi.id)), { detail: poi.summary }),
  );
  for (const site of view.sites) {
    const explored = view.exploredSiteIds.includes(site.id);
    discovery.push(
      card(`ow:site:${site.id}`, "observe", "Regional site", `Explore ${site.title}`, () => handlers.world(() => session.exploreSite(site.id)), {
        terms: `${site.kind} · danger ${site.danger}`,
        detail: site.discovery,
        ...(explored ? { disabledReason: "This expedition site is already explored." } : {}),
      }),
    );
  }
  sections.push({ id: "discoveries", cards: discovery });

  sections.push({
    id: "contacts",
    cards: view.characters.map((character) =>
      card(`ow:contact:${character.id}`, "talk", "Talk", `Talk to ${character.name}`, () => handlers.world(() => session.talkToCharacter(character.id)), {
        terms: `${character.role} · ${character.faction}`,
        detail: character.agenda,
      }),
    ),
  });

  const legalEventChoices = new Set(view.eventChoices.map(([eventId, optionId]) => `${eventId} ${optionId}`));
  const events: Card[] = [];
  for (const event of view.events) {
    const resolved = view.resolvedEventIds.includes(event.id);
    const liveOptions = event.authored_scene?.options.filter((option) => legalEventChoices.has(`${event.id} ${option.id}`)) ?? [];
    if (liveOptions.length > 0) {
      for (const option of liveOptions) {
        events.push(
          card(`ow:event:${event.id}:${option.id}`, "use", "Current event", option.title, () => handlers.world(() => session.resolveEvent(event.id, option.id)), {
            terms: `${option.terms.minutes} min · renown ${option.terms.renown}`,
            consequence: option.consequence,
            detail: `${event.authored_scene?.prompt ?? ""} ${option.preview}`.trim(),
          }),
        );
      }
      continue;
    }
    events.push(
      card(`ow:event:${event.id}:investigate`, "observe", "Current event", `Investigate ${event.title}`, () => handlers.world(() => session.investigateEvent(event.id)), {
        terms: `${event.pressure} pressure · intensity ${event.intensity}`,
        detail: event.summary,
        ...(resolved ? { disabledReason: "This event is resolved." } : {}),
      }),
    );
    if (!event.authored_scene && !resolved) {
      events.push(
        card(`ow:event:${event.id}:resolve`, "use", "Current event", `Resolve ${event.title}`, () => handlers.world(() => session.resolveEvent(event.id)), {
          terms: `${event.pressure} pressure · intensity ${event.intensity}`,
          detail: event.summary,
        }),
      );
    }
  }
  sections.push({ id: "events", cards: events });

  const legalJobChoices = new Set(view.jobChoices.map(([jobId, optionId]) => `${jobId} ${optionId}`));
  const jobs: Card[] = [];
  for (const job of view.jobs) {
    const completed = view.completedJobIds.includes(job.id);
    if (job.authored_scene) {
      for (const option of job.authored_scene.options) {
        const projected = legalJobChoices.has(`${job.id} ${option.id}`);
        jobs.push(
          card(`ow:job:${job.id}:${option.id}`, "use", "Local job", option.title, () => handlers.world(() => session.workLocalJob(job.id, option.id)), {
            terms: `${option.terms.minutes} min · renown ${option.terms.renown}`,
            consequence: option.consequence,
            detail: option.preview,
            ...(!projected ? { disabledReason: completed ? "This job is complete." : "Requirements not met." } : {}),
          }),
        );
      }
      continue;
    }
    jobs.push(
      card(`ow:job:${job.id}`, "use", "Local job", job.title, () => handlers.world(() => session.workLocalJob(job.id)), {
        terms: `${job.kind.replaceAll("_", " ")} · difficulty ${job.difficulty} · ${job.minutes} min`,
        detail: job.summary,
        ...(completed ? { disabledReason: "This job is complete." } : {}),
      }),
    );
  }
  sections.push({ id: "jobs", cards: jobs });

  sections.push({ id: "quests", cards: questCards(ctx, noticeBoard, "Notice board") });

  sections.push({
    id: "services",
    cards: view.serviceActions.map((service) => {
      const offer = view.serviceOffers.find((candidate) => candidate.id === service.offerId);
      const title = service.action === "care" ? "Receive care" : service.action === "rest" ? "Rest" : "Resupply";
      const run = service.action === "care" ? () => session.careAtTown() : service.action === "rest" ? () => session.restAtTown() : () => session.resupplyAtTown();
      return card(`ow:service:${service.action}`, "service", "Service", title, () => handlers.service(run), {
        terms: `${service.minutes} min · supplies ${service.suppliesBefore}→${service.suppliesAfter} · fatigue ${service.fatigueBefore}→${service.fatigueAfter}${offer ? ` · ${offer.summary}` : ""}`,
        detail: service.message,
        ...(!service.available ? { disabledReason: service.blockedReason ?? service.message } : {}),
      });
    }),
  });

  sections.push({
    id: "roads",
    cards: view.exits.map((exit) =>
      card(`ow:road:${exit.id}`, "travel", "Road", `Road to ${exit.destination.name}`, () => handlers.travel(exit.id), {
        terms: `${exit.route} · ${exit.distance_mi.toFixed(1)} mi · ${exit.estimate.baseMinutes} min${exit.estimate.delayMinutes > 0 ? ` + ${exit.estimate.delayMinutes} delay` : ""} · supplies ${exit.estimate.suppliesUsed}/${exit.estimate.suppliesNeeded} · fatigue +${exit.estimate.fatigueGained}`,
        ...(view.pendingRoadEncounter ? { disabledReason: "Resolve the pending road encounter first." } : {}),
      }),
    ),
  });

  if (view.pendingRoadEncounter) {
    for (const section of sections) {
      if (section.id === "encounter") continue;
      for (const c of section.cards) c.action = { ...c.action, disabledReason: "Resolve the pending road encounter before taking another action." };
    }
  }
  return sections;
}

const EXCLUSIVE = new Set(["encounter", "dispatch"]);
const REFERENCE = new Set(["services", "roads"]);

/**
 * Decide which sections lead. A pending encounter owns the screen; a legal
 * dispatch owns it next; otherwise every legal non-reference section leads
 * and roads/services stay as reference until nothing else is legal.
 */
function prioritySectionIds(sections: Section[], pendingEncounter: boolean, hasLegalDispatch: boolean): Set<string> {
  if (pendingEncounter) return new Set(["encounter"]);
  if (hasLegalDispatch) return new Set(["dispatch"]);
  const legal = sections.filter((section) => section.cards.some((c) => c.action.disabledReason === undefined));
  const focused = legal.filter((section) => !EXCLUSIVE.has(section.id) && !REFERENCE.has(section.id));
  return new Set((focused.length > 0 ? focused : legal).map((section) => section.id));
}

/** Build every overworld action, register runners, and mark the focused set primary. */
export function buildOverworldActions(ctx: OverworldActionContext): Action[] {
  const sections = buildSections(ctx);
  const hasLegalDispatch = sections.some((section) => section.id === "dispatch" && section.cards.some((c) => c.action.disabledReason === undefined));
  const priority = prioritySectionIds(sections, ctx.view.pendingRoadEncounter !== null, hasLegalDispatch);
  const primaryIds = new Set<string>();
  let budget = 9;
  for (const section of sections) {
    if (!priority.has(section.id)) continue;
    const perSection = section.id === "dispatch" || section.id === "encounter" ? 9 : 2;
    const eligible = [...section.cards]
      .sort((a, b) => Number(b.goalRelevant === true) - Number(a.goalRelevant === true))
      .filter((c) => c.action.disabledReason === undefined && c.optionalSupport !== true)
      .slice(0, perSection);
    for (const c of eligible) {
      if (budget <= 0) break;
      primaryIds.add(c.action.id);
      budget -= 1;
    }
  }
  // Goal-relevant movement always earns a card even when its section is reference-only.
  for (const section of sections) {
    for (const c of section.cards) {
      if (c.goalRelevant && c.action.disabledReason === undefined && budget > 0 && !primaryIds.has(c.action.id)) {
        primaryIds.add(c.action.id);
        budget -= 1;
      }
    }
  }
  const actions: Action[] = [];
  for (const section of sections) {
    for (const c of section.cards) {
      ctx.register(c.action.id, c.run);
      actions.push({ ...c.action, primary: primaryIds.has(c.action.id) });
    }
  }
  return actions;
}
