import { test, expect } from "./gpu-test.ts";

for (const slug of ["painted-wild", "rift-overdrive"]) {
  for (const [layout, viewport] of [["desktop", { width: 1600, height: 1000 }], ["phone", { width: 390, height: 844 }]] as const) {
    test(`${slug} ${layout} has visible artwork and readable game content`, async ({ page }, testInfo) => {
      await page.setViewportSize(viewport);
      // Fixed ambient state gives reviewable, repeatable GPU images, not moving noise.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/uis/${slug}/?client=mock`);
      await page.waitForFunction(() => window.__hui?.ready || window.__hui?.error);
      expect(await page.evaluate(() => window.__hui!.error)).toBeNull();
      await page.waitForFunction(() => window.__hui!.frames > 30);
      const skip = page.getByRole("button", { name: "Skip motion", exact: true });
      if (await skip.isEnabled()) await skip.click();
      await expect(skip).toBeDisabled();
      const clip = { x: 0, y: 36, width: viewport.width, height: viewport.height - 36 };
      expect((await page.evaluate(() => window.__hui!.sample())).nonBlank).toBe(true);
      await expect(page).toHaveScreenshot(`${slug}-${layout}-arrival.png`, { clip, maxDiffPixelRatio: 0.002 });
      await testInfo.attach("Arrival artwork", { body: await page.screenshot({ clip }), contentType: "image/png" });

      const frame = await page.evaluate(() => window.__hui!.frames);
      await page.keyboard.press("Digit1");
      await page.waitForFunction(before => window.__hui!.frames > before + 2, frame);
      expect(await page.evaluate(() => window.__hui!.scene().phase)).toBe("overworld");
      if (await skip.isEnabled()) await skip.click();
      await expect(skip).toBeDisabled();
      await expect(page).toHaveScreenshot(`${slug}-${layout}-journey.png`, { clip, maxDiffPixelRatio: 0.002 });
      await testInfo.attach("Journey artwork", { body: await page.screenshot({ clip }), contentType: "image/png" });
    });
  }
}
