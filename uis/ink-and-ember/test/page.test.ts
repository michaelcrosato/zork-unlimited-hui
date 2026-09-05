import { describe, expect, it } from "vitest";
import { createMockClient, type Scene } from "@hui/core";
import { composePage, type PageBlock } from "../page.ts";

const measure = (_ch: string, size: number) => size * 0.5;
const desktop = { width: 1440, height: 900 };

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

function kinds(blocks: PageBlock[]): string[] {
  return blocks.map((b) => b.kind);
}

describe("composePage", () => {
  it("orders the manuscript: kicker, title, prose, result, then choices", () => {
    const page = composePage(overworld(), desktop, measure);
    const order = kinds(page.blocks);
    expect(order.slice(0, 2)).toEqual(["kicker", "title"]);
    expect(order.indexOf("prose")).toBeLessThan(order.indexOf("result"));
    expect(order.indexOf("result")).toBeLessThan(order.indexOf("choice"));
  });

  it("keeps every block inside the column", () => {
    const page = composePage(overworld(), desktop, measure);
    for (const block of page.blocks) {
      expect(block.x, block.kind).toBeGreaterThanOrEqual(page.column.x);
      expect(block.x + block.width, block.kind).toBeLessThanOrEqual(page.column.x + page.column.width + 0.01);
    }
  });

  it("stacks blocks top to bottom without overlap", () => {
    const page = composePage(overworld(), desktop, measure);
    for (let i = 1; i < page.blocks.length; i++) {
      const previous = page.blocks[i - 1]!;
      const current = page.blocks[i]!;
      expect(current.y, `${current.kind} after ${previous.kind}`).toBeGreaterThanOrEqual(previous.y + previous.height - 0.01);
    }
    expect(page.height).toBeGreaterThan(0);
  });

  it("gives every primary action a numbered choice block carrying its id", () => {
    const scene = overworld();
    const page = composePage(scene, desktop, measure);
    const choices = page.blocks.filter((b) => b.kind === "choice");
    const primary = scene.actions.filter((a) => a.primary);
    expect(choices.map((b) => b.actionId)).toEqual(primary.map((a) => a.id));
    expect(choices[0]!.text.startsWith("1")).toBe(true);
    expect(choices[0]!.text).toContain(primary[0]!.label);
  });

  it("marks disabled actions and carries their reason", () => {
    const scene = chapel();
    const blocked = scene.actions.find((a) => a.disabledReason)!;
    const page = composePage(scene, desktop, measure);
    const block = page.blocks.find((b) => b.actionId === blocked.id)!;
    expect(block.disabled).toBe(true);
    expect(block.detail).toContain(blocked.disabledReason);
  });

  it("lists secondary actions as notes after the choices", () => {
    const scene = overworld();
    const page = composePage(scene, desktop, measure);
    const notes = page.blocks.filter((b) => b.kind === "note");
    const secondary = scene.actions.filter((a) => !a.primary);
    expect(notes.map((b) => b.actionId)).toEqual(secondary.map((a) => a.id));
    const lastChoice = Math.max(...page.blocks.map((b, i) => (b.kind === "choice" ? i : -1)));
    expect(page.blocks.findIndex((b) => b.kind === "note")).toBeGreaterThan(lastChoice);
  });

  it("renders dialogue as its own block naming the speaker", () => {
    const scene = storyChoice();
    const page = composePage(scene, desktop, measure);
    const dialogue = page.blocks.find((b) => b.kind === "dialogue")!;
    expect(dialogue).toBeDefined();
    expect(dialogue.text).toContain(scene.dialogue!.speaker);
    expect(dialogue.text).toContain(scene.dialogue!.text);
  });

  it("shrinks the column with margins on a narrow viewport", () => {
    const page = composePage(overworld(), { width: 400, height: 800 }, measure);
    expect(page.column.width).toBeLessThanOrEqual(400 - 2 * 24);
    expect(page.column.x).toBeGreaterThanOrEqual(24);
  });

  it("caps the column width on a wide viewport and centres it", () => {
    const page = composePage(overworld(), { width: 2560, height: 1440 }, measure);
    expect(page.column.width).toBeLessThanOrEqual(760);
    expect(Math.abs(page.column.x + page.column.width / 2 - 1280)).toBeLessThan(1);
  });

  it("shows the pressure tracks as notes in the quest", () => {
    const page = composePage(chapel(), desktop, measure);
    const pressure = page.blocks.filter((b) => b.kind === "pressure");
    expect(pressure.length).toBe(1);
    expect(pressure[0]!.text).toContain("Tide");
  });
});
