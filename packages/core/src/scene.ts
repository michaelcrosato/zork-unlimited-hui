/**
 * The Scene is the one thing every interface renders. It is produced by a
 * GameClient (the zork-unlimited adapter or the mock) and never by a UI.
 * Everything here is player-facing: no engine ids leak unless the engine
 * itself offers nothing better.
 */

export type Phase =
  | "tutorial"
  | "overworld"
  | "story_choice"
  | "journey_choice"
  | "quest"
  | "ended"
  | "recovery";

export type ActionKind =
  | "move"
  | "travel"
  | "observe"
  | "talk"
  | "engage"
  | "use"
  | "service"
  | "choice"
  | "meta";

export interface Action {
  /** Opaque and stable within one Scene; pass it back to `GameClient.act`. */
  id: string;
  /** Short player-facing label (<= 80 chars). Long authored text goes in `detail`. */
  label: string;
  kind: ActionKind;
  /** Presentation group such as "Advance", "Observe", "Speak", "Engage", "Road", "Dispatch". */
  group: string;
  /** Full authored text when `label` had to be shortened. */
  detail?: string;
  /** Costs, checks and odds the player should weigh. */
  terms?: string;
  /** What this commits to or changes. */
  consequence?: string;
  /** Present when the action is shown but cannot be taken right now. */
  disabledReason?: string;
  /** True when the action belongs on the main decision surface. */
  primary: boolean;
}

export interface Vitals {
  day: number;
  time: string;
  hp: number;
  hpMax: number | null;
  supplies: number;
  suppliesMax: number | null;
  fatigue: number;
  condition: string | null;
  money: number | null;
}

export interface Pressure {
  id: string;
  title: string;
  value: number;
  band: string;
  description: string | null;
  next: string | null;
}

export interface WorldNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  region: string;
  kind: string;
  visited: boolean;
  discovered: boolean;
  current: boolean;
}

export interface WorldEdge {
  id: string;
  from: string;
  to: string;
  route: string;
  minutes: number;
  miles: number;
  /** True when both ends are discovered, so a UI may draw it. */
  known: boolean;
}

export interface Scene {
  /** Changes whenever the place or the phase changes; drives transitions. */
  sceneId: string;
  phase: Phase;
  place: { id: string; name: string; kicker: string; context: string };
  prose: string[];
  dialogue: { speaker: string; text: string } | null;
  /** The latest consequence in full. Interfaces must never truncate it. */
  result: string;
  actions: Action[];
  vitals: Vitals;
  pressure: Pressure[];
  goal: { text: string; guidance: string | null; status: "active" | "completed" | "none" };
  /** Present in overworld phases; drives map interfaces. */
  world: { nodes: WorldNode[]; edges: WorldEdge[] } | null;
  /** Newest first. */
  journal: string[];
  saveStatus: "saved" | "pending" | "unavailable";
  /** 0..1, derived from enemies present, pressure bands and health. */
  danger: number;
  ending: { title: string; text: string; death: boolean } | null;
}

export const MAX_LABEL_LENGTH = 80;
