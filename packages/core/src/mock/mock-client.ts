import { SceneStore, type ActResult, type GameClient } from "../client.ts";
import type { Action, Phase, Pressure, Scene, WorldEdge, WorldNode } from "../scene.ts";
import {
  BACKGROUNDS,
  GOAL_TEXT,
  HP_MAX,
  QUEST_TITLE,
  ROADS,
  ROOMS,
  SUPPLIES_MAX,
  TOWNS,
  TUTORIAL_PROSE,
  WIGHT_HP,
  type RoomId,
  type TownId,
} from "./mock-world.ts";

type Area = "square" | "mill";

interface MockState {
  phase: Phase;
  town: TownId;
  area: Area;
  room: RoomId | null;
  background: string | null;
  questPosted: boolean;
  questStarted: boolean;
  questDone: boolean;
  wightHp: number;
  hp: number;
  tide: number;
  supplies: number;
  fatigue: number;
  minutes: number;
  visited: Set<TownId>;
  discovered: Set<TownId>;
  scoutedBoard: boolean;
  result: string;
  journal: string[];
  ending: Scene["ending"];
  goalStatus: Scene["goal"]["status"];
}

const START_MINUTES = 8 * 60;

function initialState(): MockState {
  return {
    phase: "tutorial",
    town: "hollow_ford",
    area: "square",
    room: null,
    background: null,
    questPosted: false,
    questStarted: false,
    questDone: false,
    wightHp: WIGHT_HP,
    hp: HP_MAX,
    tide: 0,
    supplies: SUPPLIES_MAX,
    fatigue: 0,
    minutes: START_MINUTES,
    visited: new Set<TownId>(["hollow_ford"]),
    discovered: new Set<TownId>(["hollow_ford", "blackwater", "greywatch"]),
    scoutedBoard: false,
    result: "A new journey waits at Hollow Ford.",
    journal: [],
    ending: null,
    goalStatus: "none",
  };
}

const TIDE_BANDS = ["Slack", "Rising", "Flooding", "Storm"] as const;

function timeLabel(minutes: number): { day: number; time: string } {
  const day = Math.floor(minutes / (24 * 60)) + 1;
  const rest = minutes % (24 * 60);
  const hh = String(Math.floor(rest / 60)).padStart(2, "0");
  const mm = String(rest % 60).padStart(2, "0");
  return { day, time: `${hh}:${mm}` };
}

function town(id: TownId) {
  const found = TOWNS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`unknown mock town ${id}`);
  return found;
}

class MockClient implements GameClient {
  readonly kind = "mock" as const;
  private state = initialState();
  private readonly store = new SceneStore();

  scene(): Scene {
    return buildScene(this.state);
  }

  subscribe(listener: (scene: Scene) => void): () => void {
    return this.store.subscribe(listener);
  }

  reset(): void {
    this.state = initialState();
    this.store.emit(this.scene());
  }

  act(id: string): ActResult {
    const action = this.scene().actions.find((candidate) => candidate.id === id);
    if (!action) return { ok: false, message: "That action is not available." };
    if (action.disabledReason) return { ok: false, message: action.disabledReason };
    const message = this.apply(id);
    this.state.result = message;
    this.state.journal = [message, ...this.state.journal].slice(0, 40);
    this.store.emit(this.scene());
    return { ok: true, message };
  }

  private apply(id: string): string {
    const s = this.state;
    const [kind, ...rest] = id.split(":");
    const arg = rest.join(":");
    switch (kind) {
      case "meta":
        return this.applyMeta(arg);
      case "talk":
        if (s.background === null) {
          s.phase = "story_choice";
          return "Warden Ysolde looks you over and asks what you did before you came to the ford.";
        }
        return "Warden Ysolde nods toward the causeway. \"The road is still dark. Nothing has changed since you last asked.\"";
      case "choice":
        return this.applyChoice(arg);
      case "observe":
        return this.applyObserve(arg);
      case "move":
        return this.applyMove(arg);
      case "travel":
        return this.applyTravel(arg);
      case "service":
        return this.applyService(arg);
      case "engage":
        return this.applyEngage(arg);
      case "use":
        if (arg === "lantern" && s.room === "lantern_room") {
          s.questDone = true;
          s.goalStatus = "completed";
          s.ending = {
            title: "Light Restored",
            text: "The wick catches. One by one, the posts along the causeway answer it, until the whole road is a line of small fires reaching back to Hollow Ford.",
            death: false,
          };
          return "You light the great lantern. The road answers.";
        }
        return "Nothing happens.";
      default:
        return "Nothing happens.";
    }
  }

  private applyMeta(arg: string): string {
    const s = this.state;
    if (arg === "begin") {
      s.phase = "overworld";
      return `You begin in ${town(s.town).name}. Talk to the warden, scout the board, or take a known road.`;
    }
    if (arg === "return") {
      s.phase = "journey_choice";
      s.room = null;
      return s.ending?.death
        ? "Your character did not come back from the Lantern Road. The journey must end here."
        : `You return to ${town(s.town).name} with the road lit behind you. Continue the journey, or end it here?`;
    }
    if (arg === "new") {
      this.state = initialState();
      return this.state.result;
    }
    return "Nothing happens.";
  }

  private applyChoice(arg: string): string {
    const s = this.state;
    if (s.phase === "story_choice") {
      const background = BACKGROUNDS.find((candidate) => candidate.id === arg);
      if (!background) return "Nothing happens.";
      s.background = background.id;
      s.questPosted = true;
      s.goalStatus = "active";
      s.phase = "overworld";
      s.minutes += 10;
      return `Background chosen: ${background.label}. ${background.consequence} The wardens post the Lantern Road dispatch for you.`;
    }
    if (s.phase === "journey_choice") {
      if (arg === "end") {
        s.phase = "ended";
        return "You end the journey. Its record remains.";
      }
      s.phase = "overworld";
      return `You continue the journey from ${town(s.town).name}.`;
    }
    if (arg === "start_quest" && s.phase === "overworld") {
      s.questStarted = true;
      s.phase = "quest";
      s.room = "causeway";
      s.minutes += 40;
      s.supplies = Math.max(0, s.supplies - 1);
      s.fatigue += 10;
      return `You take the Lantern Road. Forty minutes of fog bring you to the first dark post.`;
    }
    return "Nothing happens.";
  }

  private applyObserve(arg: string): string {
    const s = this.state;
    if (arg === "board") {
      s.minutes += 15;
      if (s.scoutedBoard) return "The board still says what it said: the lanterns are dark and the wardens want them lit.";
      s.scoutedBoard = true;
      return "The notice board holds one fresh sheet: the wardens will pay whoever relights the Lantern Road. Ask Warden Ysolde.";
    }
    if (arg === "look") {
      if (s.room) return ROOMS[s.room].prose.join(" ");
      return town(s.town).description;
    }
    if (arg === "pack") {
      const gear = s.background === "lamplighter" ? "a tinderbox" : s.background === "ferry_hand" ? "a boat hook" : "a reed cloak";
      return `Your pack holds ${gear}, ${s.supplies} supplies, and the wardens' dispatch.`;
    }
    return "You see nothing new.";
  }

  private applyMove(arg: string): string {
    const s = this.state;
    if (s.phase === "overworld") {
      if (arg === "mill") {
        s.area = "mill";
        s.minutes += 8;
        return "You walk to the Mill Quarter. The wheel turns; the millers watch you without stopping.";
      }
      if (arg === "square") {
        s.area = "square";
        s.minutes += 8;
        return "You return to the wardens' square.";
      }
    }
    if (s.phase === "quest" && arg === "north") {
      if (s.room === "causeway") {
        s.room = "chapel";
        s.tide = 1;
        return "You follow the dark posts north until the causeway climbs into a roofless chapel. A marsh wight turns to face you.";
      }
      if (s.room === "chapel" && s.wightHp <= 0) {
        s.room = "lantern_room";
        return "You climb the altar stair past the fallen wight into the lantern room.";
      }
    }
    return "You cannot go that way.";
  }

  private applyTravel(arg: string): string {
    const s = this.state;
    const road = ROADS.find((candidate) => candidate.id === arg);
    if (!road) return "That road does not leave from here.";
    const destination = road.from === s.town ? road.to : road.from;
    s.town = destination;
    s.area = "square";
    s.minutes += road.minutes;
    s.supplies = Math.max(0, s.supplies - 1);
    s.fatigue += road.fatigue;
    s.visited.add(destination);
    s.discovered.add(destination);
    for (const next of ROADS) {
      if (next.from === destination) s.discovered.add(next.to);
      if (next.to === destination) s.discovered.add(next.from);
    }
    return `You travel ${road.miles.toFixed(1)} miles along ${road.route} to ${town(destination).name}. Time ${road.minutes} min; supplies -1; fatigue +${road.fatigue}.`;
  }

  private applyService(arg: string): string {
    const s = this.state;
    if (arg === "rest") {
      s.minutes += 120;
      const before = s.fatigue;
      s.fatigue = Math.max(0, s.fatigue - 20);
      return `You rest two hours. Fatigue ${before} → ${s.fatigue}.`;
    }
    if (arg === "resupply") {
      s.minutes += 20;
      const before = s.supplies;
      s.supplies = SUPPLIES_MAX;
      return `You resupply. Supplies ${before} → ${s.supplies}.`;
    }
    return "No such service.";
  }

  private applyEngage(arg: string): string {
    const s = this.state;
    if (s.room !== "chapel" || s.wightHp <= 0) return "There is nothing to fight.";
    const damage = arg === "strike" ? (s.background === "ferry_hand" ? 4 : 3) : 1;
    s.wightHp = Math.max(0, s.wightHp - damage);
    s.tide = Math.min(3, s.tide + 1);
    if (s.wightHp <= 0) {
      return arg === "strike"
        ? "Your strike lands. The wight folds into the water it came from and the altar stair is open."
        : "You hold behind the lantern pole until the wight spends itself against it and slides back into the water.";
    }
    if (arg === "strike") {
      s.hp = Math.max(0, s.hp - 3);
      if (s.hp <= 0) {
        s.ending = {
          title: "Taken by the Tide",
          text: "The wight's cold hand finds your throat. The last thing you see is the dark post above the altar.",
          death: true,
        };
        s.goalStatus = "active";
        return "You strike, and the wight strikes back harder. You fall on the chapel stones.";
      }
      return `You strike the wight (it has ${s.wightHp} left). It rakes you for 3; you have ${s.hp}.`;
    }
    return `You brace behind the lantern pole and jab. The wight has ${s.wightHp} left; it cannot reach you this round.`;
  }
}

function buildScene(s: MockState): Scene {
  const { day, time } = timeLabel(s.minutes);
  const currentTown = town(s.town);
  const vitals: Scene["vitals"] = {
    day,
    time,
    hp: s.hp,
    hpMax: HP_MAX,
    supplies: s.supplies,
    suppliesMax: SUPPLIES_MAX,
    fatigue: s.fatigue,
    condition: s.fatigue < 30 ? "ready" : s.fatigue < 60 ? "tired" : "exhausted",
    money: 12,
  };
  const goal: Scene["goal"] = {
    text: GOAL_TEXT,
    guidance: s.goalStatus === "active" ? "Take the Lantern Road dispatch from Hollow Ford." : null,
    status: s.goalStatus,
  };
  const base = {
    vitals,
    goal,
    journal: s.journal,
    saveStatus: "saved" as const,
    ending: s.ending,
    result: s.result,
    dialogue: null as Scene["dialogue"],
    pressure: [] as Pressure[],
    world: null as Scene["world"],
    danger: 0.05,
  };

  switch (s.phase) {
    case "tutorial":
      return {
        ...base,
        sceneId: "tutorial",
        phase: "tutorial",
        place: { id: "tutorial", name: "Day one", kicker: "The Lantern Road", context: "Hollow Ford" },
        prose: TUTORIAL_PROSE,
        actions: [{ id: "meta:begin", label: "Begin the journey", kind: "meta", group: "Journey", primary: true }],
      };
    case "story_choice":
      return {
        ...base,
        sceneId: `story:${s.town}`,
        phase: "story_choice",
        place: { id: s.town, name: currentTown.name, kicker: "Choose your background", context: currentTown.region },
        prose: ["Your background stays with this character. Choose the experience you want to carry."],
        dialogue: {
          speaker: "Warden Ysolde",
          text: "Nobody walks that road for free. Tell me what you were before, and I will tell you what you are owed.",
        },
        actions: BACKGROUNDS.map((background) => ({
          id: `choice:${background.id}`,
          label: background.label,
          kind: "choice" as const,
          group: "Background",
          terms: background.terms,
          consequence: background.consequence,
          primary: true,
        })),
      };
    case "journey_choice":
      return {
        ...base,
        sceneId: `journey:${s.town}`,
        phase: "journey_choice",
        place: { id: s.town, name: currentTown.name, kicker: "Journey pause", context: currentTown.region },
        prose: [s.ending?.death ? "Your character died on the Lantern Road." : "The goal is complete. This is a safe place to stop."],
        actions: [
          {
            id: "choice:continue",
            label: "Continue the journey",
            kind: "choice",
            group: "Journey",
            consequence: "Stay with this character and keep travelling.",
            primary: true,
            ...(s.ending?.death ? { disabledReason: "A dead character cannot continue." } : {}),
          },
          {
            id: "choice:end",
            label: "End the journey here",
            kind: "choice",
            group: "Journey",
            consequence: "Close the record. You can begin a new journey afterwards.",
            primary: true,
          },
        ],
      };
    case "ended":
      return {
        ...base,
        sceneId: "ended",
        phase: "ended",
        place: { id: "ended", name: "Journey record", kicker: "The Lantern Road", context: currentTown.name },
        prose: [
          s.goalStatus === "completed"
            ? "You restored the light on the Lantern Road and ended the journey by choice."
            : "The journey ended before the road was lit.",
        ],
        actions: [{ id: "meta:new", label: "Begin a new journey", kind: "meta", group: "Journey", primary: true }],
      };
    case "quest":
      return buildQuestScene(s, base);
    case "overworld":
    default:
      return buildOverworldScene(s, base);
  }
}

type SceneBase = Pick<
  Scene,
  "vitals" | "goal" | "journal" | "saveStatus" | "ending" | "result" | "dialogue" | "pressure" | "world" | "danger"
>;

function buildOverworldScene(s: MockState, base: SceneBase): Scene {
  const currentTown = town(s.town);
  const actions: Action[] = [];
  if (s.town === "hollow_ford" && s.area === "square") {
    actions.push({
      id: "talk:ysolde",
      label: "Talk to Warden Ysolde",
      kind: "talk",
      group: "Speak",
      terms: "warden · Hollow Ford",
      primary: true,
    });
    actions.push({
      id: "observe:board",
      label: "Scout the ford notice board",
      kind: "observe",
      group: "Observe",
      terms: "15 min",
      primary: true,
    });
    if (s.questPosted && !s.questStarted && !s.questDone) {
      actions.push({
        id: "choice:start_quest",
        label: `Take the ${QUEST_TITLE}`,
        kind: "choice",
        group: "Dispatch",
        terms: "40 min · 1 supply · fatigue +10",
        consequence: "Starts the quest. The town waits until you return.",
        primary: true,
      });
    }
  }
  if (s.town === "hollow_ford") {
    actions.push(
      s.area === "square"
        ? { id: "move:mill", label: "Walk to the Mill Quarter", kind: "move", group: "Local route", terms: "8 min", primary: true }
        : { id: "move:square", label: "Return to the wardens' square", kind: "move", group: "Local route", terms: "8 min", primary: true },
    );
  }
  for (const road of ROADS) {
    if (road.from !== s.town && road.to !== s.town) continue;
    const destination = town(road.from === s.town ? road.to : road.from);
    actions.push({
      id: `travel:${road.id}`,
      label: `Take ${road.route} to ${destination.name}`,
      kind: "travel",
      group: "Road",
      terms: `${road.miles.toFixed(1)} mi · ${road.minutes} min · 1 supply · fatigue +${road.fatigue}`,
      primary: true,
      ...(s.supplies === 0 ? { disabledReason: "You have no supplies for the road." } : {}),
    });
  }
  actions.push(
    { id: "service:rest", label: "Rest at the inn", kind: "service", group: "Service", terms: "120 min · fatigue −20", primary: false },
    { id: "service:resupply", label: "Resupply at the market", kind: "service", group: "Service", terms: "20 min · supplies to full", primary: false },
    { id: "observe:look", label: "Look around", kind: "observe", group: "Observe", primary: false },
  );

  const nodes: WorldNode[] = TOWNS.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    lat: candidate.lat,
    lon: candidate.lon,
    region: candidate.region,
    kind: candidate.kind,
    visited: s.visited.has(candidate.id),
    discovered: s.discovered.has(candidate.id),
    current: candidate.id === s.town,
  }));
  const edges: WorldEdge[] = ROADS.map((road) => ({
    id: road.id,
    from: road.from,
    to: road.to,
    route: road.route,
    minutes: road.minutes,
    miles: road.miles,
    known: s.discovered.has(road.from) && s.discovered.has(road.to),
  }));

  return {
    ...base,
    sceneId: `overworld:${s.town}:${s.area}`,
    phase: "overworld",
    place: {
      id: s.town,
      name: currentTown.name,
      kicker: `${currentTown.kind} · ${currentTown.region}`,
      context: s.area === "mill" ? "Mill Quarter" : "Wardens' square",
    },
    prose: [
      currentTown.description,
      s.area === "mill" ? "The Mill Quarter smells of wet grain. Nobody here has time for the lanterns." : "",
    ].filter(Boolean),
    actions,
    world: { nodes, edges },
  };
}

function buildQuestScene(s: MockState, base: SceneBase): Scene {
  const room = ROOMS[s.room ?? "causeway"];
  const wightAlive = s.room === "chapel" && s.wightHp > 0;
  const actions: Action[] = [];
  if (s.ending) {
    actions.push({
      id: "meta:return",
      label: "Return to Hollow Ford",
      kind: "meta",
      group: "Journey",
      primary: true,
    });
  } else {
    if (s.room === "causeway") {
      actions.push({ id: "move:north", label: "Go north along the posts", kind: "move", group: "Advance", primary: true });
    }
    if (s.room === "chapel") {
      if (wightAlive) {
        actions.push(
          {
            id: "engage:strike",
            label: "Strike the wight",
            kind: "engage",
            group: "Engage",
            terms: `opening · ATK +${s.background === "ferry_hand" ? 4 : 3} · you take 3 if it survives`,
            primary: true,
          },
          {
            id: "engage:brace",
            label: "Brace behind the lantern pole",
            kind: "engage",
            group: "Engage",
            terms: "guarded · ATK +1 · DEF full",
            primary: true,
          },
        );
      }
      actions.push({
        id: "move:north",
        label: "Go north up the altar stair",
        kind: "move",
        group: "Advance",
        primary: true,
        ...(wightAlive ? { disabledReason: "The wight blocks the stair." } : {}),
      });
    }
    if (s.room === "lantern_room") {
      actions.push({
        id: "use:lantern",
        label: "Light the great lantern",
        kind: "use",
        group: "Act",
        terms: s.background === "lamplighter" ? "Lanterncraft 4 · no check needed" : "Fieldcraft 0 vs DC 8",
        consequence: "Completes the quest.",
        primary: true,
      });
    }
  }
  actions.push(
    { id: "observe:look", label: "Look around", kind: "observe", group: "Observe", primary: false },
    { id: "observe:pack", label: "Check your pack", kind: "observe", group: "Observe", primary: false },
  );

  const pressure: Pressure[] = [
    {
      id: "tide",
      title: "Tide",
      value: s.tide,
      band: TIDE_BANDS[Math.min(3, s.tide)] ?? "Slack",
      description:
        s.tide === 0
          ? "The water sits still under the causeway."
          : s.tide < 3
            ? "The water is climbing the chapel steps."
            : "The tide has taken the lower causeway.",
      next: s.tide < 3 ? `Next ${TIDE_BANDS[s.tide + 1]} at ${s.tide + 1}` : null,
    },
  ];
  const danger = Math.min(1, (wightAlive ? 0.6 : 0.1) + s.tide * 0.1 + (1 - s.hp / HP_MAX) * 0.3);

  return {
    ...base,
    sceneId: `quest:${room.id}${s.ending ? ":ended" : ""}`,
    phase: "quest",
    place: { id: room.id, name: room.name, kicker: `${QUEST_TITLE} · ${room.name}`, context: "Hollow Ford" },
    prose: s.ending ? [s.ending.text] : room.prose,
    dialogue: null,
    actions,
    pressure,
    danger,
  };
}

export function createMockClient(): GameClient {
  return new MockClient();
}
