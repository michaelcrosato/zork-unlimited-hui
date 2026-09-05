import { describe, expect, it } from "vitest";
import { createMockClient } from "@hui/core";
import { tankFor, tideglassLayout } from "../tank.ts";

describe("tideglass instruments", () => {
  it("tracks bounded health and supplies while distinguishing unknown capacities", () => {
    const scene = createMockClient().scene();
    expect(tankFor(scene).health).toBe(1);
    scene.vitals.hp = scene.vitals.hpMax! / 2;
    expect(tankFor(scene).health).toBe(0.5);
    scene.vitals.hp = -4; scene.vitals.supplies = 100;
    expect(tankFor(scene).health).toBe(0);
    expect(tankFor(scene).supplies).toBe(1);
    scene.vitals.hpMax = null; scene.vitals.suppliesMax = 0;
    expect(tankFor(scene).healthKnown).toBe(false);
    expect(tankFor(scene).suppliesKnown).toBe(false);
  });
  it.each([[320, 568], [390, 844], [844, 390], [1200, 800], [1600, 1000], [2560, 1440]])("keeps its expedition panes separate at %sx%s", (w, h) => {
    const layout = tideglassLayout(w, h);
    expect(layout.story.y + layout.story.height).toBeLessThanOrEqual(h);
    if (!layout.mobile) {
      expect(layout.log.x + layout.log.width).toBeLessThan(layout.story.x);
      expect(layout.story.x + layout.story.width).toBeLessThan(layout.actions.x);
      expect(layout.story.y).toBeGreaterThan(layout.tank.y + layout.tank.height);
    }
  });
});
