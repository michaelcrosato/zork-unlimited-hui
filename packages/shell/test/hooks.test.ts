import { describe, expect, it } from "vitest";
import { createMockClient } from "@hui/core";
import { createHooks } from "@hui/shell";

function hooks() {
  const client = createMockClient();
  return createHooks({
    ui: "test-ui",
    client,
    sample: () => Promise.resolve({ nonBlank: true, distinct: 1, width: 1, height: 1 }),
  });
}

describe("e2e hooks", () => {
  it("exposes the interface and client identity and starts not ready", () => {
    const h = hooks();
    expect(h.ui).toBe("test-ui");
    expect(h.client).toBe("mock");
    expect(h.ready).toBe(false);
    expect(h.frames).toBe(0);
    expect(h.error).toBeNull();
    expect(h.scene().phase).toBe("tutorial");
  });

  it("acts through the client", () => {
    const h = hooks();
    expect(h.act("meta:begin").ok).toBe(true);
    expect(h.scene().phase).toBe("overworld");
  });

  it("counts frames and averages fps over the trailing second", () => {
    const h = hooks();
    for (let i = 0; i <= 120; i++) h.markFrame(i * (1000 / 60));
    expect(h.frames).toBe(121);
    expect(h.fps).toBeGreaterThan(55);
    expect(h.fps).toBeLessThan(65);
  });

  it("flips ready and records a failure message", () => {
    const h = hooks();
    h.setReady();
    expect(h.ready).toBe(true);
    h.fail("no adapter");
    expect(h.error).toBe("no adapter");
  });
});
