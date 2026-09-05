import { describe, expect, it } from "vitest";
import { createMockClient, diceFromNarrations } from "@hui/core";

describe("canonical dice narration",()=>{
  it("preserves both real combat rolls, their order, modifiers and damage floors",()=>{
    const narrations=["You strike the wolf for 7 (d6 4 + 5 atk - 2 def; it has 8 HP left).",
      "The wolf hits you for 1 (d6 2 + 2 atk - 5 def = -1, blunted to the floor of 1; you have 29 HP left)."];
    const rolls=diceFromNarrations(narrations);
    expect(rolls.map(r=>[r.role,r.value,r.modifier,r.total,r.detail])).toEqual([
      ["player",4,3,7,narrations[0]],["enemy",2,-3,1,narrations[1]],
    ]);
  });
  it("carries successful and failed d20 arithmetic and the actual difficulty",()=>{
    const rolls=diceFromNarrations(["repair check: d20 14 + 2 = 16 vs 12 — success.","fieldcraft check: d20 3 + -1 = 2 vs 14 — failure."]);
    expect(rolls.map(r=>[r.sides,r.value,r.modifier,r.total,r.target,r.outcome])).toEqual([[20,14,2,16,12,"success"],[20,3,-1,2,14,"failure"]]);
  });
  it("rejects invented, malformed, out-of-range and contradictory results",()=>{
    expect(diceFromNarrations([
      "The wolf takes 7 damage.","Yesterday: repair check: d20 14 + 2 = 16 vs 12 — success.",
      "repair check: d20 21 + 2 = 23 vs 12 — success.","repair check: d20 14 + 2 = 17 vs 12 — success.",
      "repair check: d20 14 + 2 = 16 vs 12 — failure.",
      "You strike the wolf for 8 (d6 4 + 5 atk - 2 def; it has 7 HP left).",
    ])).toEqual([]);
  });
  it("does not add dice to fixed-damage mock actions or create events for rejected actions",()=>{
    const client=createMockClient();
    expect(client.scene().presentation).toBeUndefined();
    client.act(client.scene().actions[0]!.id);
    const event=client.scene().presentation;
    expect(event?.sequence).toBe(1); expect(event?.rolls).toEqual([]);
    expect(client.act("not-an-action").ok).toBe(false);
    expect(client.scene().presentation).toEqual(event);
    client.reset(); expect(client.scene().presentation).toBeUndefined();
  });
});
