import { expect, test, type Page } from "./gpu-test.ts";
import type { Action } from "@hui/core";
import { engineLinked } from "../../scripts/engine-path.mjs";

const slugs = ["astral-orrery", "lantern-theatre", "tideglass", "painted-wild", "rift-overdrive"];
test.use({ hasTouch: true });

test("the gallery links to all five additional interfaces", async ({ page }) => {
  await page.goto("/");
  for (const slug of slugs) await expect(page.locator(`#gallery a[href="/uis/${slug}/"]`)).toBeVisible();
});

async function boot(page: Page, slug: string, client = "mock") {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`/uis/${slug}/?client=${client}`);
  await page.waitForFunction(() => window.__hui?.ready || window.__hui?.error);
  expect(await page.evaluate(() => window.__hui!.error)).toBeNull();
  await page.waitForFunction(() => window.__hui!.frames > 30);
  return errors;
}

async function clickAction(page: Page, predicate: (a: Action) => boolean, satellite = false) {
  const actions = await page.evaluate(() => window.__hui!.scene().actions);
  const index = actions.findIndex(a => !a.disabledReason && predicate(a));
  expect(index, `missing action: ${actions.map(a => `${a.id}: ${a.label}`).join(" | ")}`).toBeGreaterThanOrEqual(0);
  const id = actions[index]!.id;
  // Focusing the real accessibility button must bring its GPU card into view.
  if (!satellite) await page.locator(".hui-a11y button").nth(index).focus();
  const rect = await page.evaluate(({ id, satellite }) => window.__hui!.layout!().actions.find(a => a.id === id && (satellite || a.width > 60)), { id, satellite });
  expect(rect, `no visible GPU target for ${id}`).toBeDefined();
  const frames = await page.evaluate(() => window.__hui!.frames);
  await page.mouse.click(rect!.x + Math.min(rect!.width / 2, 120), rect!.y + Math.min(rect!.height / 2, 30));
  await page.waitForFunction(before => window.__hui!.frames > before + 2, frames);
  expect(await page.evaluate(() => window.__hui!.error)).toBeNull();
}

for (const slug of slugs) {
  test.describe(slug, () => {
    test("plays the complete mock journey through GPU targets and rejects disabled choices", async ({ page }) => {
      const errors = await boot(page, slug);
      await page.keyboard.press("Digit1");
      expect(await page.evaluate(() => window.__hui!.scene().phase)).toBe("overworld");
      await clickAction(page, a => a.kind === "talk", slug === "astral-orrery");
      expect(await page.evaluate(() => window.__hui!.scene().phase)).toBe("story_choice");
      await clickAction(page, a => a.kind === "choice" && /marsh guide/i.test(a.label));
      await clickAction(page, a => a.group === "Dispatch");
      expect(await page.evaluate(() => window.__hui!.scene().place.name)).toBe("The Causeway");
      await clickAction(page, a => a.kind === "move" && /north/i.test(a.label));
      const blocked = await page.evaluate(() => window.__hui!.scene().actions.find(a => a.disabledReason));
      expect(blocked).toBeDefined();
      await expect(page.getByRole("button", { name: new RegExp(blocked!.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) })).toBeDisabled();
      const before = await page.evaluate(() => window.__hui!.scene().result);
      const primary = await page.evaluate(() => window.__hui!.scene().actions.filter(a => a.primary));
      const number = primary.findIndex(a => a.id === blocked!.id) + 1;
      if (number > 0 && number < 10) await page.keyboard.press(`Digit${number}`);
      expect(await page.evaluate(() => window.__hui!.scene().result)).toBe(before);
      await page.screenshot({ path: `test-results/screens/${slug}-quest.png` });
      expect((await page.evaluate(() => window.__hui!.sample())).nonBlank).toBe(true);
      for (let round = 0; round < 8; round++) {
        if (!await page.evaluate(() => window.__hui!.scene().actions.some(a => a.kind === "engage"))) break;
        await clickAction(page, a => a.kind === "engage");
      }
      await clickAction(page, a => a.kind === "move" && /north/i.test(a.label));
      await clickAction(page, a => a.kind === "use" && /lantern/i.test(a.label));
      expect(await page.evaluate(() => window.__hui!.scene().ending?.death)).toBe(false);
      await clickAction(page, a => a.kind === "meta" && /return/i.test(a.label));
      expect(await page.evaluate(() => window.__hui!.scene().phase)).toBe("journey_choice");
      await clickAction(page, a => a.kind === "choice" && /^end/i.test(a.label));
      expect(await page.evaluate(() => window.__hui!.scene().phase)).toBe("ended");
      await page.screenshot({ path: `test-results/screens/${slug}-ending.png` });
      expect(errors).toEqual([]);
    });

    test("supports narrow screens, wheel, touch, keyboard scrolling and secondary actions", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const errors = await boot(page, slug);
      await page.keyboard.press("Digit1");
      const geometry = await page.evaluate(() => window.__hui!.layout!());
      expect(geometry.panels).toHaveLength(1);
      const panel = geometry.panels[0]!;
      expect(panel.x + panel.width).toBeLessThanOrEqual(390);
      expect(panel.y + panel.height).toBeLessThanOrEqual(844);
      const hud = await page.locator(".hui-hud select").boundingBox();
      expect(hud!.x + hud!.width).toBeLessThanOrEqual(390);
      await page.mouse.move(160, panel.y + 150);
      await page.mouse.wheel(0, 240);
      await expect.poll(() => page.evaluate(() => window.__hui!.layout!().panels[0]!.scroll)).toBeGreaterThan(100);
      await page.keyboard.press("Home");
      expect(await page.evaluate(() => window.__hui!.layout!().panels[0]!.scroll)).toBe(0);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 170, y: panel.y + 260 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 170, y: panel.y + 90 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await cdp.detach();
      expect(await page.evaluate(() => window.__hui!.layout!().panels[0]!.scroll)).toBeGreaterThan(100);
      await page.keyboard.press("End");
      const end = await page.evaluate(() => window.__hui!.layout!().panels[0]!);
      expect(end.scroll).toBe(end.maxScroll);
      await clickAction(page, a => !a.primary && a.kind === "observe");
      expect(await page.evaluate(() => window.__hui!.scene().phase)).toBe("overworld");
      await page.keyboard.press("Home");
      await page.screenshot({ path: `test-results/screens/${slug}-mobile.png` });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => window.__hui!.layout!().panels.length > 1);
      expect((await page.evaluate(() => window.__hui!.sample())).nonBlank).toBe(true);
      expect(errors).toEqual([]);
    });

    test("freezes ambient motion while reduced-motion gameplay remains active", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const errors = await boot(page, slug);
      const clip = { x: 24, y: 60, width: 1540, height: 910 };
      const before = await page.screenshot({ clip });
      const frame = await page.evaluate(() => window.__hui!.frames);
      await page.waitForFunction(before => window.__hui!.frames > before + 30, frame);
      expect((await page.screenshot({ clip })).equals(before)).toBe(true);
      await page.keyboard.press("Digit1");
      expect(await page.evaluate(() => window.__hui!.scene().phase)).toBe("overworld");
      expect(errors).toEqual([]);
    });

    test("renders at 60 fps or better at 2560 by 1440", async ({ page }) => {
      await page.setViewportSize({ width: 2560, height: 1440 });
      const errors = await boot(page, slug);
      await page.keyboard.press("Digit1");
      await page.waitForTimeout(2500);
      const fps = await page.evaluate(() => window.__hui!.fps);
      const adapter = await page.evaluate(async () => {
        const gpu = await navigator.gpu.requestAdapter();
        return gpu ? { vendor: gpu.info.vendor, architecture: gpu.info.architecture, device: gpu.info.description } : null;
      });
      console.log(`${slug}: ${Math.round(fps)} fps at 2560×1440; ${JSON.stringify(adapter)}`);
      expect(fps).toBeGreaterThanOrEqual(60);
      await page.screenshot({ path: `test-results/screens/${slug}-1440p.png` });
      expect(errors).toEqual([]);
    });

    test("finishes the live Wolf-Winter, reloads and shares its save with another interface", async ({ page }) => {
      test.skip(!engineLinked().linked, "Sibling engine is not linked");
      const errors = await boot(page, slug, "live");
      await page.keyboard.press("Digit1");
      await clickAction(page, a => a.kind === "talk" && /rowan quill/i.test(a.label));
      await clickAction(page, a => a.kind === "choice" && /road warden/i.test(a.label));
      for (let i = 0; i < 8 && await page.evaluate(() => window.__hui!.scene().phase === "story_choice"); i++) {
        const hasChoice = await page.evaluate(() => window.__hui!.scene().actions.some(a => a.kind === "choice" && !a.disabledReason));
        await clickAction(page, a => a.kind === (hasChoice ? "choice" : "meta"));
      }
      await clickAction(page, a => a.kind === "move" && /station quarter/i.test(a.label));
      await clickAction(page, a => a.group === "Dispatch" && a.kind === "choice");
      expect(await page.evaluate(() => window.__hui!.scene().place.name)).toBe("The Steading Yard");
      await clickAction(page, a => a.kind === "use" || a.kind === "move");
      const saved = await page.evaluate(() => ({ id: window.__hui!.scene().sceneId, vitals: window.__hui!.scene().vitals }));
      await page.screenshot({ path: `test-results/screens/${slug}-live-quest.png` });
      await page.reload();
      await page.waitForFunction(() => window.__hui?.ready);
      expect(await page.evaluate(() => ({ id: window.__hui!.scene().sceneId, vitals: window.__hui!.scene().vitals }))).toEqual(saved);
      const next = slugs[(slugs.indexOf(slug) + 1) % slugs.length]!;
      await page.getByRole("combobox", { name: "Interface", exact: true }).selectOption(next);
      await page.waitForURL(`**/uis/${next}/?client=live`);
      await page.waitForFunction(() => window.__hui?.ready);
      expect(await page.evaluate(() => ({ id: window.__hui!.scene().sceneId, vitals: window.__hui!.scene().vitals }))).toEqual(saved);
      await page.getByRole("combobox", { name: "Interface", exact: true }).selectOption(slug);
      await page.waitForURL(`**/uis/${slug}/?client=live`);
      await page.waitForFunction(() => window.__hui?.ready);

      // The engine's authored prepared HUNT route: counsel, armour and three
      // maneuver sequences. Only currently legal actions are ever clicked.
      const questStep = async (id: string) => {
        if (await page.evaluate(() => window.__hui!.scene().phase === "journey_choice")) {
          await clickAction(page, a => a.id === "journey:continue");
        }
        await clickAction(page, a => a.id === `q:${id}`);
      };
      for (const id of ["talk_houndsman", "ask_wolves", "ask_byre", "ask_leave", "go_west", "take_byre_jerkin", "use_byre_jerkin", "go_east", "go_north"]) await questStep(id);
      await clickAction(page, a => a.kind === "use" && /brace.*paling-rail/i.test(a.label));
      const sequences = [
        ["yearling_wolf", "set_spear", "drive_set_spear"],
        ["flank_wolf", "funnel_thrust", "pin_at_rail"],
        ["grey_leader", "wait_out_feint", "take_true_rush"],
      ];
      for (const [enemy, opening, follow] of sequences) {
        await questStep(`maneuver_${enemy}_${opening}`);
        const followId = `maneuver_${enemy}_${follow}`;
        if (await page.evaluate(id => window.__hui!.scene().actions.some(a => a.id === `q:${id}` && !a.disabledReason), followId)) await questStep(followId);
        for (let i = 0; i < 10; i++) {
          if (await page.evaluate(() => window.__hui!.scene().phase === "journey_choice")) await clickAction(page, a => a.id === "journey:continue");
          if (!await page.evaluate(id => window.__hui!.scene().actions.some(a => a.id === `q:attack_${id}` && !a.disabledReason), enemy)) break;
          await questStep(`attack_${enemy}`);
        }
        await questStep("go_north");
      }
      const finalScene = await page.evaluate(() => window.__hui!.scene());
      expect(finalScene.vitals.hp).toBeGreaterThan(0);
      expect(finalScene.phase === "journey_choice" || finalScene.ending !== null).toBe(true);
      if (finalScene.phase !== "journey_choice") await clickAction(page, a => a.id === "meta:return");
      expect(await page.evaluate(() => window.__hui!.scene().phase)).toBe("journey_choice");
      await page.screenshot({ path: `test-results/screens/${slug}-live-complete.png` });
      await clickAction(page, a => a.id === "journey:end");
      expect(await page.evaluate(() => window.__hui!.scene().phase)).toBe("ended");
      expect(errors).toEqual([]);
    });
  });
}
