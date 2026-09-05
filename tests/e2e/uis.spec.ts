import { expect, test, type Page } from "./gpu-test.ts";
import { fileURLToPath } from "node:url";
import { listUis } from "../../vite-plugins/gallery-plugin.ts";
import { engineLinked } from "../../scripts/engine-path.mjs";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const uis = listUis(repoRoot);
const clients: ("mock" | "live")[] = engineLinked().linked ? ["mock", "live"] : ["mock"];

test("the gallery lists at least one interface", () => {
  expect(uis.length).toBeGreaterThan(0);
});

async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

for (const ui of uis) {
  test.describe(ui.slug, () => {
    for (const client of clients) {
      test(`renders on the GPU and responds to an action (${client})`, async ({ page }) => {
        const errors = await collectErrors(page);
        await page.goto(`/uis/${ui.slug}/?client=${client}`);
        await page.waitForFunction(
          () => window.__hui !== undefined && (window.__hui.ready === true || window.__hui.error !== null),
          null,
          { timeout: 45_000 },
        );
        const boot = await page.evaluate(() => ({
          error: window.__hui!.error,
          hasGpu: "gpu" in navigator,
          client: window.__hui!.client,
          ui: window.__hui!.ui,
          phase: window.__hui!.scene().phase,
        }));
        expect(boot.error).toBeNull();
        expect(boot.hasGpu).toBe(true);
        expect(boot.client).toBe(client);
        expect(boot.ui).toBe(ui.slug);

        await page.waitForFunction(() => window.__hui!.frames > 30, null, { timeout: 20_000 });
        const sample = await page.evaluate(() => window.__hui!.sample());
        expect(sample.nonBlank, "the canvas rendered only one colour").toBe(true);
        expect(sample.distinct, "the canvas has too little detail").toBeGreaterThan(16);

        const before = await page.evaluate(() => {
          const scene = window.__hui!.scene();
          return { sceneId: scene.sceneId, result: scene.result };
        });
        const acted = await page.evaluate(() => {
          const hooks = window.__hui!;
          const action = hooks.scene().actions.find((candidate) => candidate.primary && !candidate.disabledReason);
          return action ? { label: action.label, result: hooks.act(action.id) } : null;
        });
        expect(acted, "no enabled primary action to try").not.toBeNull();
        expect(acted!.result.ok, `acting on "${acted!.label}" failed: ${acted!.result.message}`).toBe(true);
        const after = await page.evaluate(() => {
          const scene = window.__hui!.scene();
          return { sceneId: scene.sceneId, result: scene.result, phase: scene.phase, place: scene.place.name };
        });
        expect(after.sceneId !== before.sceneId || after.result !== before.result).toBe(true);
        if (client === "live" && boot.phase === "tutorial") {
          expect(after.phase).toBe("overworld");
          expect(after.place).toMatch(/albany/i);
        }

        await page.waitForTimeout(1500);
        await page.screenshot({ path: `test-results/screens/${ui.slug}-${client}.png` });
        const fps = await page.evaluate(() => window.__hui!.fps);
        expect(fps, "frame rate after the action").toBeGreaterThan(24);
        expect(errors).toEqual([]);
      });
    }
  });
}
