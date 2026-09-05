import { describe, expect, it } from "vitest";
import { createMockClient, type ActionKind, type Scene } from "@hui/core";
import { clampScroll, scenePanel } from "@hui/shell";

const measure = (_ch: string, size: number) => size * 0.54;
const measures = { body: measure, display: measure, italic: measure };
const rect = { x: 16, y: 120, width: 358, height: 600 };

describe("GPU reading panels", () => {
  it("preserves long authored text, every action kind, and secondary-action explanations", () => {
    const scene = createMockClient().scene();
    scene.prose = ["Long unbroken text: " + "word".repeat(200), "Last paragraph."];
    scene.result = "Full result. ".repeat(150);
    scene.ending = { title: "An ending", text: "Ending text survives.", death: false };
    scene.dialogue = { speaker: "Guide", text: "A complete conversation." };
    scene.goal.guidance = "Objective guidance survives.";
    scene.pressure = [{ id: "tide", title: "Tide", value: 3, band: "High", description: "Pressure explanation.", next: "The next band." }];
    scene.journal = ["Latest journal entry.", "Oldest journal entry."];
    const kinds: ActionKind[] = ["move", "travel", "observe", "talk", "engage", "use", "service", "choice", "meta"];
    scene.actions = kinds.map((kind, i) => ({ id: kind, kind, label: `Action ${kind}`, group: kind, primary: i % 2 === 0,
      detail: `Full ${kind} text.`, terms: `${kind} cost.`, consequence: `${kind} consequence.`, ...(i === 5 ? { disabledReason: "Need a key." } : {}) }));
    const panel = scenePanel(scene, "mobile", rect, measures, ["story", "actions", "log"]);
    const text = panel.blocks.map(b => b.text).join("\n");
    for (const value of [...scene.prose, scene.result, scene.ending.text, scene.dialogue.text, scene.goal.guidance,
      ...scene.journal, "Pressure explanation.", "The next band.", "Need a key."]) expect(text).toContain(value);
    for (const action of scene.actions) for (const value of [action.label, action.detail, action.terms, action.consequence]) expect(text).toContain(value);
    expect(panel.cards.map(c => c.id)).toEqual(scene.actions.map(a => a.id));
    expect(panel.cards.find(c => c.id === "use")?.disabled).toBe(true);
    scene.actions.filter(a => a.primary).forEach((a, i) => expect(text).toContain(`${i + 1}. ${a.label}`));
    for (const block of panel.blocks) {
      expect(block.x).toBeGreaterThanOrEqual(0);
      expect(block.x + block.layout.width).toBeLessThanOrEqual(rect.width);
    }
    for (let i = 1; i < panel.blocks.length; i++) expect(panel.blocks[i]!.y).toBeGreaterThanOrEqual(panel.blocks[i - 1]!.y + panel.blocks[i - 1]!.layout.height);
  });

  it("lays out tutorial, overworld, choices, quest, recovery and endings without losing actions", () => {
    const client = createMockClient();
    const scenes: Scene[] = [client.scene()];
    for (const id of ["meta:begin", "talk:ysolde", "choice:marsh_guide", "choice:start_quest", "move:north"]) {
      expect(client.act(id).ok).toBe(true);
      scenes.push(client.scene());
    }
    scenes.push({ ...client.scene(), phase: "recovery", actions: [] });
    scenes.push({ ...client.scene(), phase: "ended", ending: { title: "Lost", text: "Final words.", death: true } });
    for (const scene of scenes) {
      const panel = scenePanel(scene, "all", rect, measures, ["story", "actions", "log"]);
      expect(panel.cards).toHaveLength(scene.actions.length);
      expect(panel.blocks.some(b => b.text === scene.result)).toBe(true);
      expect(Number.isFinite(panel.contentHeight)).toBe(true);
    }
  });

  it("clamps scrolling at both edges and reaches the final action", () => {
    const client = createMockClient(); client.act("meta:begin");
    const panel = scenePanel(client.scene(), "actions", { ...rect, height: 240 }, measures, ["actions"]);
    const end = clampScroll(panel, Infinity);
    expect(end).toBeGreaterThan(0);
    expect(clampScroll(panel, -Infinity)).toBe(0);
    const last = panel.cards.at(-1)!;
    expect(last.y + last.height - end).toBeLessThanOrEqual(panel.rect.height);
    expect(clampScroll({ ...panel, contentHeight: 10 }, 100)).toBe(0);
  });
});
