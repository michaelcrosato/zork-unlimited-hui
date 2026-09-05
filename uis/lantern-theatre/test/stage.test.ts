import { describe, expect, it } from "vitest";
import { createMockClient } from "@hui/core";
import { stageFor, theatreLayout } from "../stage.ts";

describe("theatre stage", () => {
  it("changes its paths and lighting with the actual scene and closes on death", () => {
    const client = createMockClient();
    expect(stageFor(client.scene()).doors).toBe(0);
    client.act("meta:begin");
    const scene = client.scene();
    expect(stageFor(scene).doors).toBe(3);
    expect(stageFor(scene).company).toBe(1);
    const death = stageFor({ ...scene, danger: 5, ending: { title: "Lost", text: "The end", death: true } });
    expect(death.danger).toBe(1);
    expect(death.curtain).toBeGreaterThan(stageFor(scene).curtain);
    expect(stageFor(scene)).toEqual(stageFor(scene));
  });
  it.each([[320, 568], [390, 844], [844, 390], [1024, 768], [1600, 1000], [2560, 1440]])("separates scenery and reading panels at %sx%s", (w, h) => {
    const layout = theatreLayout(w, h);
    expect(layout.story.y).toBeGreaterThan(layout.stage.y + layout.stage.height);
    expect(layout.story.y + layout.story.height).toBeLessThanOrEqual(h);
    if (!layout.mobile) expect(layout.story.x + layout.story.width).toBeLessThan(layout.actions.x);
  });
});
