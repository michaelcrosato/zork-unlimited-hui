import { describe, expect, it } from "vitest";
import { createMockClient, MAX_LABEL_LENGTH, type Action, type GameClient, type Scene } from "@hui/core";

function pick(scene: Scene, predicate: (action: Action) => boolean): Action {
  const found = scene.actions.find((action) => predicate(action) && action.disabledReason === undefined);
  if (!found) {
    throw new Error(
      `no matching action in ${scene.phase} at ${scene.place.name}: ${scene.actions
        .map((action) => `${action.kind}:${action.label}`)
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

const begin = (client: GameClient) => step(client, (a) => a.kind === "meta");
const talkToWarden = (client: GameClient) => step(client, (a) => a.kind === "talk" && /ysolde/i.test(a.label));
const chooseFirstBackground = (client: GameClient) => step(client, (a) => a.kind === "choice");
const startQuest = (client: GameClient) => step(client, (a) => a.group === "Dispatch" && /lantern road/i.test(a.label));

function reachQuest(client: GameClient): Scene {
  begin(client);
  talkToWarden(client);
  chooseFirstBackground(client);
  return startQuest(client);
}

function finishQuest(client: GameClient): Scene {
  reachQuest(client);
  step(client, (a) => a.kind === "move" && /north/i.test(a.label));
  let scene = client.scene();
  for (let round = 0; round < 8 && scene.actions.some((a) => a.kind === "engage"); round++) {
    scene = step(client, (a) => a.kind === "engage");
  }
  step(client, (a) => a.kind === "move" && /north/i.test(a.label));
  return step(client, (a) => a.kind === "use" && /lantern/i.test(a.label));
}

describe("mock client", () => {
  it("identifies itself as the mock", () => {
    expect(createMockClient().kind).toBe("mock");
  });

  it("starts in the tutorial with a single primary action", () => {
    const scene = createMockClient().scene();
    expect(scene.phase).toBe("tutorial");
    expect(scene.actions.filter((a) => a.primary)).toHaveLength(1);
    expect(scene.prose.length).toBeGreaterThan(0);
  });

  it("beginning the journey lands in the overworld with a world graph and several primary actions", () => {
    const client = createMockClient();
    const scene = begin(client);
    expect(scene.phase).toBe("overworld");
    expect(scene.actions.filter((a) => a.primary).length).toBeGreaterThanOrEqual(3);
    expect(scene.world).not.toBeNull();
    expect(scene.world!.nodes.length).toBeGreaterThanOrEqual(3);
    expect(scene.world!.nodes.filter((n) => n.current)).toHaveLength(1);
  });

  it("rejects an unknown action id without changing the scene", () => {
    const client = createMockClient();
    begin(client);
    const before = client.scene();
    const result = client.act("not-a-real-action");
    expect(result.ok).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
    expect(client.scene().sceneId).toBe(before.sceneId);
    expect(client.scene().result).toBe(before.result);
  });

  it("talking to the warden opens a background choice with three options", () => {
    const client = createMockClient();
    begin(client);
    const scene = talkToWarden(client);
    expect(scene.phase).toBe("story_choice");
    expect(scene.actions.filter((a) => a.kind === "choice")).toHaveLength(3);
    expect(scene.dialogue?.speaker).toMatch(/ysolde/i);
  });

  it("choosing a background returns to the overworld and posts the Lantern Road dispatch", () => {
    const client = createMockClient();
    begin(client);
    talkToWarden(client);
    const scene = chooseFirstBackground(client);
    expect(scene.phase).toBe("overworld");
    expect(scene.actions.some((a) => a.group === "Dispatch" && /lantern road/i.test(a.label))).toBe(true);
    expect(scene.goal.status).toBe("active");
  });

  it("travelling to Blackwater Crossing changes place and spends supplies", () => {
    const client = createMockClient();
    const before = begin(client);
    const after = step(client, (a) => a.kind === "travel" && /blackwater/i.test(a.label));
    expect(after.place.name).toMatch(/blackwater/i);
    expect(after.sceneId).not.toBe(before.sceneId);
    expect(after.vitals.supplies).toBeLessThan(before.vitals.supplies);
    expect(after.world!.nodes.find((n) => n.current)?.name).toMatch(/blackwater/i);
  });

  it("starting the quest enters the Causeway", () => {
    const client = createMockClient();
    const scene = reachQuest(client);
    expect(scene.phase).toBe("quest");
    expect(scene.place.name).toBe("The Causeway");
    expect(scene.place.kicker).not.toMatch(/_/);
    expect(scene.actions.some((a) => a.kind === "move")).toBe(true);
  });

  it("the Drowned Chapel presents an engage action and raises danger", () => {
    const client = createMockClient();
    reachQuest(client);
    const scene = step(client, (a) => a.kind === "move" && /north/i.test(a.label));
    expect(scene.place.name).toBe("The Drowned Chapel");
    expect(scene.actions.some((a) => a.kind === "engage")).toBe(true);
    expect(scene.danger).toBeGreaterThan(0.3);
    expect(scene.pressure.length).toBeGreaterThan(0);
  });

  it("defeating the wight and lighting the lantern reaches a non-death ending", () => {
    const client = createMockClient();
    const scene = finishQuest(client);
    expect(scene.ending).not.toBeNull();
    expect(scene.ending!.death).toBe(false);
    expect(scene.actions.filter((a) => a.kind === "engage")).toHaveLength(0);
    expect(scene.actions.some((a) => a.kind === "meta" && /return/i.test(a.label))).toBe(true);
  });

  it("after the ending, returning offers a journey choice and ending the journey ends the game", () => {
    const client = createMockClient();
    finishQuest(client);
    const choice = step(client, (a) => a.kind === "meta" && /return/i.test(a.label));
    expect(choice.phase).toBe("journey_choice");
    expect(choice.actions.filter((a) => a.kind === "choice")).toHaveLength(2);
    const ended = step(client, (a) => a.kind === "choice" && /^end/i.test(a.label));
    expect(ended.phase).toBe("ended");
    expect(ended.goal.status).toBe("completed");
  });

  it("notifies subscribers once per accepted action and never on a rejected one", () => {
    const client = createMockClient();
    const seen: string[] = [];
    const unsubscribe = client.subscribe((scene) => seen.push(scene.phase));
    begin(client);
    client.act("bogus");
    expect(seen).toEqual(["overworld"]);
    unsubscribe();
    talkToWarden(client);
    expect(seen).toEqual(["overworld"]);
  });

  it("reset returns to the tutorial", () => {
    const client = createMockClient();
    reachQuest(client);
    client.reset();
    expect(client.scene().phase).toBe("tutorial");
  });

  it("keeps unique action ids and short labels along the whole scripted path", () => {
    const client = createMockClient();
    const scenes: Scene[] = [client.scene()];
    client.subscribe((scene) => scenes.push(scene));
    finishQuest(client);
    for (const scene of scenes) {
      const ids = scene.actions.map((a) => a.id);
      expect(new Set(ids).size, `duplicate ids in ${scene.place.name}`).toBe(ids.length);
      for (const action of scene.actions) {
        expect(action.label.length, `label too long: ${action.label}`).toBeLessThanOrEqual(MAX_LABEL_LENGTH);
        expect(action.label.trim().length).toBeGreaterThan(0);
      }
      expect(scene.result.length).toBeGreaterThan(0);
    }
    expect(scenes.length).toBeGreaterThan(6);
  });

  it("world edges reference existing nodes", () => {
    const client = createMockClient();
    const { world } = begin(client);
    const ids = new Set(world!.nodes.map((n) => n.id));
    expect(world!.edges.length).toBeGreaterThan(0);
    for (const edge of world!.edges) {
      expect(ids.has(edge.from), edge.id).toBe(true);
      expect(ids.has(edge.to), edge.id).toBe(true);
    }
  });
});
