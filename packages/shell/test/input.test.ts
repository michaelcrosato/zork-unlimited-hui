import { describe, expect, it } from "vitest";
import type { Action, Scene } from "@hui/core";
import { actionForKey, nextIndex, primaryActions } from "@hui/shell";

function action(id: string, primary = true, disabledReason?: string): Action {
  return { id, label: id, kind: "observe", group: "Observe", primary, ...(disabledReason ? { disabledReason } : {}) };
}

function sceneWith(actions: Action[]): Scene {
  return {
    sceneId: "s",
    phase: "overworld",
    place: { id: "p", name: "Place", kicker: "", context: "" },
    prose: [],
    dialogue: null,
    result: "",
    actions,
    vitals: { day: 1, time: "08:00", hp: 1, hpMax: 1, supplies: 1, suppliesMax: 1, fatigue: 0, condition: null, money: null },
    pressure: [],
    goal: { text: "", guidance: null, status: "none" },
    world: null,
    journal: [],
    saveStatus: "saved",
    danger: 0,
    ending: null,
  };
}

const scene = sceneWith([action("a"), action("ref", false), action("b"), action("blocked", true, "Not now."), action("c")]);

describe("keyboard mapping", () => {
  it("lists only primary actions, in order", () => {
    expect(primaryActions(scene).map((a) => a.id)).toEqual(["a", "b", "blocked", "c"]);
  });

  it("maps Digit1 to the first primary action", () => {
    expect(actionForKey("Digit1", scene)).toBe("a");
  });

  it("maps the numpad like the digit row", () => {
    expect(actionForKey("Numpad2", scene)).toBe("b");
  });

  it("numbers disabled cards but refuses to fire them", () => {
    expect(actionForKey("Digit3", scene)).toBeNull();
    expect(actionForKey("Digit4", scene)).toBe("c");
  });

  it("returns null past the last primary action and for other keys", () => {
    expect(actionForKey("Digit9", scene)).toBeNull();
    expect(actionForKey("KeyA", scene)).toBeNull();
  });
});

describe("nextIndex", () => {
  it("advances and wraps forward", () => {
    expect(nextIndex(0, 3, 1)).toBe(1);
    expect(nextIndex(2, 3, 1)).toBe(0);
  });

  it("retreats and wraps backward", () => {
    expect(nextIndex(0, 3, -1)).toBe(2);
  });

  it("returns -1 when there is nothing to focus", () => {
    expect(nextIndex(0, 0, 1)).toBe(-1);
  });
});
