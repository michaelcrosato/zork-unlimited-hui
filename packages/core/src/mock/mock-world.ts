/**
 * "The Lantern Road": a tiny original world used when the zork-unlimited
 * engine is not linked. It exists so every interface can be developed, demoed
 * and tested against every Scene phase and every Action kind without the game.
 */

export type TownId = "hollow_ford" | "blackwater" | "saltmarsh" | "greywatch";
export type RoomId = "causeway" | "chapel" | "lantern_room";

export interface MockTown {
  id: TownId;
  name: string;
  kind: string;
  region: string;
  lat: number;
  lon: number;
  description: string;
}

export interface MockRoad {
  id: string;
  from: TownId;
  to: TownId;
  route: string;
  minutes: number;
  miles: number;
  fatigue: number;
}

export interface MockRoom {
  id: RoomId;
  name: string;
  prose: string[];
}

export const TOWNS: readonly MockTown[] = [
  {
    id: "hollow_ford",
    name: "Hollow Ford",
    kind: "market town",
    region: "Tidewater",
    lat: 41.02,
    lon: -72.3,
    description:
      "Hollow Ford sits where the causeway meets the river: a wardens' hall, a ferry stair, and a notice board that has not been read in days.",
  },
  {
    id: "blackwater",
    name: "Blackwater Crossing",
    kind: "crossing",
    region: "Tidewater",
    lat: 41.1,
    lon: -72.18,
    description:
      "A stone bridge over black water, with a tollhouse that no longer collects tolls and a lamp that no longer burns.",
  },
  {
    id: "saltmarsh",
    name: "Saltmarsh",
    kind: "village",
    region: "Saltmarsh Reach",
    lat: 40.95,
    lon: -72.05,
    description: "Reed huts on stilts. The tide comes twice a day and takes something each time.",
  },
  {
    id: "greywatch",
    name: "Greywatch",
    kind: "watch tower",
    region: "Greywatch Hills",
    lat: 41.2,
    lon: -72.4,
    description: "A signal tower on the hills. From here every lantern on the road can be counted.",
  },
];

export const ROADS: readonly MockRoad[] = [
  { id: "road_hollow_blackwater", from: "hollow_ford", to: "blackwater", route: "Old Causeway Road", minutes: 35, miles: 6.2, fatigue: 6 },
  { id: "road_hollow_greywatch", from: "hollow_ford", to: "greywatch", route: "Ridge Track", minutes: 70, miles: 12.5, fatigue: 14 },
  { id: "road_blackwater_saltmarsh", from: "blackwater", to: "saltmarsh", route: "Marsh Road", minutes: 50, miles: 9.1, fatigue: 9 },
  { id: "road_greywatch_blackwater", from: "greywatch", to: "blackwater", route: "Hill Road", minutes: 60, miles: 11.4, fatigue: 11 },
];

export const ROOMS: Record<RoomId, MockRoom> = {
  causeway: {
    id: "causeway",
    name: "The Causeway",
    prose: [
      "The causeway runs straight into the fog. Lantern posts stand every forty paces, and every one of them is dark.",
      "Water moves on both sides of the stones. Something moves with it.",
    ],
  },
  chapel: {
    id: "chapel",
    name: "The Drowned Chapel",
    prose: [
      "The road climbs into a roofless chapel. The last lantern post stands by the altar stair, and a marsh wight stands in front of it, dripping.",
    ],
  },
  lantern_room: {
    id: "lantern_room",
    name: "The Lantern Room",
    prose: [
      "A narrow room at the top of the stair. The great lantern waits under a canvas, its wick dry and its glass whole.",
    ],
  },
};

export const BACKGROUNDS = [
  {
    id: "marsh_guide",
    label: "Marsh guide",
    terms: "Starts with Wayfinding 4 and a reed cloak",
    consequence: "You know the tides. The chapel fight will not surprise you.",
  },
  {
    id: "lamplighter",
    label: "Lamplighter",
    terms: "Starts with Lanterncraft 4 and a tinderbox",
    consequence: "You can relight what others cannot. The lantern room will take less time.",
  },
  {
    id: "ferry_hand",
    label: "Ferry hand",
    terms: "Starts with Brawn 4 and a boat hook",
    consequence: "You hit harder. The wight will fall faster.",
  },
] as const;

export const TUTORIAL_PROSE = [
  "The lanterns along the Lantern Road have gone out one by one, and the wardens of Hollow Ford have run out of volunteers.",
  "Talk to people to find work. Scout to find leads. Roads cost time, supplies and fatigue; towns let you rest and resupply.",
];

export const GOAL_TEXT = "Restore the light on the Lantern Road.";
export const QUEST_TITLE = "The Lantern Road";
export const HP_MAX = 12;
export const SUPPLIES_MAX = 8;
export const WIGHT_HP = 6;
