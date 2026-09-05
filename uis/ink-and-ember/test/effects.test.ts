import { describe, expect, it } from "vitest";
import { createMockClient, type Scene } from "@hui/core";
import { effectsFor } from "../effects.ts";

function scene(mutate?: (scene: Scene) => Scene): Scene {
  const client = createMockClient();
  client.act("meta:begin");
  const base = client.scene();
  return mutate ? mutate(base) : base;
}

describe("effectsFor", () => {
  it("gives a calm overworld light snow and no embers", () => {
    const fx = effectsFor(scene());
    expect(fx.snowDensity).toBeGreaterThan(0.05);
    expect(fx.snowDensity).toBeLessThan(0.4);
    expect(fx.emberDensity).toBe(0);
    expect(fx.inkRun).toBe(0);
  });

  it("turns danger into embers and thins the snow", () => {
    const calm = effectsFor(scene());
    const hot = effectsFor(scene((s) => ({ ...s, danger: 1 })));
    expect(hot.emberDensity).toBeGreaterThan(0.6);
    expect(hot.snowDensity).toBeLessThan(calm.snowDensity);
  });

  it("runs the ink on a death ending", () => {
    const fx = effectsFor(scene((s) => ({ ...s, ending: { title: "Taken", text: "…", death: true } })));
    expect(fx.inkRun).toBe(1);
  });

  it("does not run the ink on a victorious ending", () => {
    const fx = effectsFor(scene((s) => ({ ...s, ending: { title: "Light", text: "…", death: false } })));
    expect(fx.inkRun).toBe(0);
  });

  it("darkens the page as pressure climbs", () => {
    const calm = effectsFor(scene());
    const pressed = effectsFor(
      scene((s) => ({ ...s, pressure: [{ id: "t", title: "Tide", value: 3, band: "Storm", description: null, next: null }] })),
    );
    expect(pressed.soot).toBeGreaterThan(calm.soot);
  });

  it("keeps every value within 0 and 1", () => {
    const fx = effectsFor(scene((s) => ({ ...s, danger: 7, pressure: [{ id: "t", title: "T", value: 99, band: "", description: null, next: null }] })));
    for (const value of Object.values(fx)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
