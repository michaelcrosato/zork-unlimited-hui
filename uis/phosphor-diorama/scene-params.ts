import type { Scene } from "@hui/core";

export const DOOR = { north: 1, east: 2, south: 4, west: 8 } as const;

/** Everything the ray-marched chamber needs to know about the current scene. */
export interface DioramaParams {
  /** Bitmask of open doorways, see DOOR. */
  doors: number;
  /** Red forms in the room, 0..4. */
  enemyCount: number;
  /** Warm lights in the room, 0..4. */
  npcCount: number;
  /** Pedestals with objects, 0..6. */
  objects: number;
  fog: number;
  /** Radians around the chamber, 0 at midnight, π at noon. */
  sunAngle: number;
  night: number;
  glitch: number;
  warmth: number;
  danger: number;
  /** Stable 0..1 hash of the place id, for per-room variation. */
  roomSeed: number;
  /** 0 overworld, 1 quest, 2 choice or pause, 3 tutorial or ended. */
  phase: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function hourOf(time: string): number {
  const match = /(\d{1,2}):(\d{2})/.exec(time);
  return match ? Number(match[1]) + Number(match[2]) / 60 : 12;
}

function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h / 4294967296;
}

function doorsFrom(scene: Scene): number {
  const exits = scene.actions.filter((a) => a.kind === "move" || a.kind === "travel");
  let doors = 0;
  const fallback = [DOOR.east, DOOR.west, DOOR.south, DOOR.north];
  let next = 0;
  for (const exit of exits) {
    const label = exit.label.toLowerCase();
    let bit = 0;
    if (/\bnorth/.test(label)) bit |= DOOR.north;
    if (/\beast/.test(label)) bit |= DOOR.east;
    if (/\bsouth/.test(label)) bit |= DOOR.south;
    if (/\bwest/.test(label)) bit |= DOOR.west;
    if (bit === 0) bit = fallback[next++ % fallback.length]!;
    doors |= bit;
  }
  return doors;
}

export function sceneParams(scene: Scene): DioramaParams {
  const danger = clamp01(scene.danger);
  const peakPressure = scene.pressure.reduce((max, track) => Math.max(max, track.value), 0);
  const pressure = clamp01(peakPressure / 3);
  const hour = hourOf(scene.vitals.time);
  const elevation = Math.sin(((hour - 6) / 12) * Math.PI);
  const npcCount = Math.min(4, (scene.dialogue ? 1 : 0) + scene.actions.filter((a) => a.kind === "talk").length);
  const phase =
    scene.phase === "overworld" ? 0 : scene.phase === "quest" ? 1 : scene.phase === "story_choice" || scene.phase === "journey_choice" ? 2 : 3;
  return {
    doors: doorsFrom(scene),
    enemyCount: danger >= 0.5 ? Math.min(4, 1 + Math.floor((danger - 0.5) * 4)) : 0,
    npcCount,
    objects: Math.min(6, scene.actions.filter((a) => a.primary && (a.kind === "use" || a.kind === "observe")).length),
    fog: clamp01(0.15 + 0.6 * pressure + 0.25 * danger),
    sunAngle: (hour / 24) * Math.PI * 2,
    night: clamp01(0.5 - elevation * 1.5),
    glitch: scene.ending?.death ? 1 : 0,
    warmth: clamp01(0.3 + (scene.dialogue ? 0.4 : 0) + 0.15 * npcCount),
    danger,
    roomSeed: hashSeed(scene.place.id),
    phase,
  };
}
