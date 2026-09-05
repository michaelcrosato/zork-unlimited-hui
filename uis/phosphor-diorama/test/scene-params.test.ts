import { describe, expect, it } from "vitest";
import { createMockClient, type Scene } from "@hui/core";
import { DOOR, sceneParams } from "../scene-params.ts";

function overworld(): Scene {
  const client = createMockClient();
  client.act("meta:begin");
  return client.scene();
}

function storyChoice(): Scene {
  const client = createMockClient();
  client.act("meta:begin");
  client.act("talk:ysolde");
  return client.scene();
}

function chapel(): Scene {
  const client = createMockClient();
  for (const id of ["meta:begin", "talk:ysolde", "choice:marsh_guide", "choice:start_quest", "move:north"]) client.act(id);
  return client.scene();
}

function causeway(): Scene {
  const client = createMockClient();
  for (const id of ["meta:begin", "talk:ysolde", "choice:marsh_guide", "choice:start_quest"]) client.act(id);
  return client.scene();
}

describe("sceneParams", () => {
  it("reads exits from movement actions into a door bitmask", () => {
    const params = sceneParams(causeway());
    expect(params.doors & DOOR.north).toBe(DOOR.north);
    expect(params.doors & DOOR.south).toBe(0);
    const withSouth = sceneParams({ ...causeway(), actions: [{ id: "m", label: "Go south", kind: "move", group: "Advance", primary: true }] });
    expect(withSouth.doors & DOOR.south).toBe(DOOR.south);
  });

  it("gives an overworld with roads several doors even without compass words", () => {
    expect(sceneParams(overworld()).doors).not.toBe(0);
  });

  it("counts threats from danger", () => {
    expect(sceneParams(overworld()).enemyCount).toBe(0);
    expect(sceneParams(chapel()).enemyCount).toBeGreaterThanOrEqual(1);
    expect(sceneParams({ ...chapel(), danger: 1 }).enemyCount).toBeLessThanOrEqual(4);
  });

  it("lights people from talk actions and dialogue", () => {
    expect(sceneParams(overworld()).npcCount).toBeGreaterThanOrEqual(1);
    expect(sceneParams(storyChoice()).npcCount).toBeGreaterThanOrEqual(1);
    expect(sceneParams(causeway()).npcCount).toBe(0);
  });

  it("thickens the fog as pressure climbs", () => {
    const calm = sceneParams(causeway());
    const pressed = sceneParams({ ...causeway(), pressure: [{ id: "t", title: "Tide", value: 3, band: "Storm", description: null, next: null }] });
    expect(pressed.fog).toBeGreaterThan(calm.fog);
  });

  it("turns the sun with the clock", () => {
    const noon = sceneParams({ ...overworld(), vitals: { ...overworld().vitals, time: "12:00" } });
    const midnight = sceneParams({ ...overworld(), vitals: { ...overworld().vitals, time: "00:00" } });
    expect(noon.sunAngle).toBeCloseTo(Math.PI, 5);
    expect(midnight.sunAngle).toBeCloseTo(0, 5);
    expect(noon.night).toBe(0);
    expect(midnight.night).toBe(1);
  });

  it("glitches on a death ending only", () => {
    expect(sceneParams(overworld()).glitch).toBe(0);
    expect(sceneParams({ ...chapel(), ending: { title: "Taken", text: "…", death: true } }).glitch).toBe(1);
    expect(sceneParams({ ...chapel(), ending: { title: "Light", text: "…", death: false } }).glitch).toBe(0);
  });

  it("keeps a stable seed per place and changes it between places", () => {
    expect(sceneParams(causeway()).roomSeed).toBe(sceneParams(causeway()).roomSeed);
    expect(sceneParams(causeway()).roomSeed).not.toBe(sceneParams(chapel()).roomSeed);
  });

  it("keeps every normalised value within 0 and 1", () => {
    const params = sceneParams({ ...chapel(), danger: 5, pressure: [{ id: "t", title: "T", value: 40, band: "", description: null, next: null }] });
    for (const key of ["fog", "glitch", "warmth", "danger", "night", "roomSeed"] as const) {
      expect(params[key], key).toBeGreaterThanOrEqual(0);
      expect(params[key], key).toBeLessThanOrEqual(1);
    }
  });
});
