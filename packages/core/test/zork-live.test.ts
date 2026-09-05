import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_LABEL_LENGTH, diceFromNarrations, type Action, type GameClient, type Scene } from "@hui/core";
import { engineStatus } from "../../../scripts/engine-path.mjs";

const status = engineStatus();

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

async function liveClient(storage: Storage): Promise<GameClient> {
  const { createZorkClient } = await import("../src/zork/live/zork-client.ts");
  return createZorkClient(
    {
      overworld: readFileSync(status.overworld, "utf8"),
      packs: status.packs.map((file) => ({ path: `content/rpg/quests/${basename(file)}`, source: readFileSync(file, "utf8") })),
    },
    storage,
  );
}

function pick(scene: Scene, predicate: (action: Action) => boolean): Action {
  const found = scene.actions.find((action) => predicate(action) && action.disabledReason === undefined);
  if (!found) {
    throw new Error(
      `no matching action in ${scene.phase} at ${scene.place.name}: ${scene.actions
        .map((action) => `${action.kind}/${action.group}:${action.label}`)
        .join(" | ")}`,
    );
  }
  return found;
}

function step(client: GameClient, predicate: (action: Action) => boolean): Scene {
  const action = pick(client.scene(), predicate);
  const result = client.act(action.id);
  expect(result.ok, `acting on "${action.label}" failed: ${result.message}`).toBe(true);
  return client.scene();
}

function settleStoryChoices(client: GameClient): Scene {
  for (let i = 0; i < 8 && client.scene().phase === "story_choice"; i++) {
    const scene = client.scene();
    const choice = scene.actions.find((a) => a.kind === "choice" && !a.disabledReason);
    if (choice) client.act(choice.id);
    else step(client, (a) => a.kind === "meta");
  }
  return client.scene();
}

function reachStation(client: GameClient): Scene {
  step(client, (a) => a.kind === "meta");
  step(client, (a) => a.kind === "talk" && /rowan quill/i.test(a.label));
  step(client, (a) => a.kind === "choice" && /road warden/i.test(a.label));
  settleStoryChoices(client);
  return step(client, (a) => a.kind === "move" && /station quarter/i.test(a.label));
}

function enterQuest(client: GameClient): Scene {
  reachStation(client);
  return step(client, (a) => a.group === "Dispatch" && a.kind === "choice");
}

describe.skipIf(!status.present)("zork-unlimited adapter (live engine)", () => {
  it("starts in the tutorial with one meta action", async () => {
    const scene = (await liveClient(memoryStorage())).scene();
    expect(scene.phase).toBe("tutorial");
    expect(scene.actions.filter((a) => a.primary).map((a) => a.kind)).toEqual(["meta"]);
    expect(scene.prose.length).toBeGreaterThan(0);
  });

  it("starting lands in Albany with a warden to talk to, roads, and the whole world graph", async () => {
    const client = await liveClient(memoryStorage());
    const scene = step(client, (a) => a.kind === "meta");
    expect(scene.phase).toBe("overworld");
    expect(scene.place.name).toMatch(/albany city/i);
    expect(scene.actions.some((a) => a.kind === "talk" && /rowan quill/i.test(a.label))).toBe(true);
    expect(scene.actions.some((a) => a.kind === "travel")).toBe(true);
    expect(scene.world?.nodes).toHaveLength(247);
    expect(scene.world?.edges).toHaveLength(344);
    expect(scene.world?.nodes.filter((n) => n.current)).toHaveLength(1);
    expect(scene.world?.nodes.filter((n) => n.discovered).length).toBeGreaterThan(1);
  });

  it("talking to Rowan Quill opens the background choice with four options", async () => {
    const client = await liveClient(memoryStorage());
    step(client, (a) => a.kind === "meta");
    const scene = step(client, (a) => a.kind === "talk" && /rowan quill/i.test(a.label));
    expect(scene.phase).toBe("story_choice");
    expect(scene.actions.filter((a) => a.kind === "choice")).toHaveLength(4);
    expect(scene.actions.some((a) => /road warden/i.test(a.label))).toBe(true);
  });

  it("the Albany setup chain returns to the overworld and the Station posts a dispatch", async () => {
    const client = await liveClient(memoryStorage());
    const scene = reachStation(client);
    expect(scene.phase).toBe("overworld");
    expect(scene.goal.status).toBe("active");
    expect(scene.result).not.toMatch(/Walked Go from/);
    expect(scene.actions.filter((a) => a.group === "Dispatch" && a.kind === "choice").length).toBeGreaterThanOrEqual(2);
  });

  it("departing enters The Steading Yard with humanised fields and accepts a first action", async () => {
    const client = await liveClient(memoryStorage());
    const scene = enterQuest(client);
    expect(scene.phase).toBe("quest");
    expect(scene.place.name).toBe("The Steading Yard");
    expect(scene.place.kicker).not.toMatch(/_/);
    expect(scene.vitals.hp).toBe(30);
    expect(scene.pressure.length).toBeGreaterThanOrEqual(3);
    for (const action of scene.actions) expect(action.label.length, action.label).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
    const before = scene.result;
    const after = step(client, (a) => a.kind === "use" || a.kind === "move");
    expect(after.phase).toBe("quest");
    expect(after.result).not.toBe(before);
  });

  it("a second client on the same storage resumes the quest exactly", async () => {
    const storage = memoryStorage();
    const first = await liveClient(storage);
    enterQuest(first);
    step(first, (a) => a.kind === "use" || a.kind === "move");
    const saved = first.scene();
    const second = await liveClient(storage);
    const resumed = second.scene();
    expect(resumed.phase).toBe("quest");
    expect(resumed.sceneId).toBe(saved.sceneId);
    expect(resumed.place.name).toBe(saved.place.name);
    expect(resumed.result).toMatch(/^Resumed/);
  });

  it("rejects an unknown action id without changing the scene", async () => {
    const client = await liveClient(memoryStorage());
    step(client, (a) => a.kind === "meta");
    const before = client.scene();
    const result = client.act("ow:nothing:here");
    expect(result.ok).toBe(false);
    expect(client.scene().sceneId).toBe(before.sceneId);
    expect(client.scene().result).toBe(before.result);
  });

  it("presents only the current attack's seeded dice and drops them on reload", async () => {
    const storage=memoryStorage(),client=await liveClient(storage);
    enterQuest(client);
    step(client,a=>a.kind==="use" || a.kind==="move");
    step(client,a=>a.id==="q:go_north");
    let after=client.scene();
    for(let i=0;i<4 && !after.presentation?.rolls.length;i++) after=step(client,a=>a.kind==="engage");
    const event=after.presentation!;
    expect(event.rolls.map(r=>r.role)).toEqual(["player","enemy"]);
    expect(event.rolls).toEqual(diceFromNarrations(event.narrations));
    expect(event.damageTaken).toBe(event.rolls[1]!.total);
    for(const roll of event.rolls) { expect(roll.value).toBeGreaterThanOrEqual(1); expect(roll.value).toBeLessThanOrEqual(6); expect(after.result).toContain(roll.detail); }
    expect((await liveClient(storage)).scene().presentation).toBeUndefined();
    step(client,a=>a.kind==="observe"); expect(client.scene().presentation?.rolls).toEqual([]);
  });

  it("exposes an actual d20 from the authored DRIVE signal skill check", async () => {
    const client=await liveClient(memoryStorage()); enterQuest(client);
    step(client,a=>a.kind==="use" || a.kind==="move");
    step(client,a=>a.id==="q:talk_houndsman");
    step(client,a=>/^Ask DRIVE /i.test(a.label)); step(client,a=>/^CHOOSE DRIVE/i.test(a.label));
    step(client,a=>/^LEAVE /i.test(a.label));
    step(client,a=>/^take .*signal-and-rope/i.test(a.label));
    step(client,a=>a.id==="q:go_north");
    const after=step(client,a=>/\bfire drive shutter signal/i.test(a.label));
    const rolls=after.presentation!.rolls;
    expect(rolls).toHaveLength(1); expect(rolls[0]!.sides).toBe(20); expect(rolls[0]!.role).toBe("check");
    expect(rolls[0]!.total).toBe(rolls[0]!.value+rolls[0]!.modifier);
    expect(after.result).toContain(rolls[0]!.detail);
  });
});
