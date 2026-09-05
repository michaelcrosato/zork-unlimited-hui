// Dev helper: load one interface in headless Chrome with WebGPU, print console output and GPU info, save a screenshot.
// Usage: node scripts/screenshot-ui.mjs <slug> [mock|live] [out.png] [actionId,actionId,...]  (needs `pnpm preview` running; Playwright wipes test-results/, so screens/ is used)
import { chromium } from "@playwright/test";

const slug = process.argv[2] ?? "ink-and-ember";
const client = process.argv[3] ?? "mock";
const out = process.argv[4] ?? `screens/${slug}-${client}.png`;
const actions = (process.argv[5] ?? "").split(",").filter(Boolean);

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on("console", (m) => {
  console.log("[console]", m.type(), m.text().slice(0, 600));
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => { console.log("[pageerror]", String(e)); errors.push(String(e)); });
try {
  await page.goto(`http://127.0.0.1:4173/uis/${slug}/?client=${client}`);
  await page.waitForFunction(() => window.__hui?.ready === true || window.__hui?.error, null, { timeout: 30000 });
  const bootError = await page.evaluate(() => window.__hui.error);
  if (bootError) throw new Error(bootError);
  for (const id of actions) {
    const r = await page.evaluate((id) => window.__hui.act(id), id);
    console.log("[act]", id, JSON.stringify(r));
    if (!r.ok) throw new Error(`Action ${id} failed: ${r.message}`);
  }
  await page.waitForTimeout(3500);
  const info = await page.evaluate(async () => {
    const h = window.__hui;
    const s = await h.sample();
    const adapter = await navigator.gpu.requestAdapter();
    const c = document.querySelector("canvas");
    return {
      sample: s,
      frames: h.frames,
      fps: Math.round(h.fps),
      error: h.error,
      adapter: adapter?.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description } : null,
      canvas: { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight },
      scene: { phase: h.scene().phase, place: h.scene().place.name, actions: h.scene().actions.length },
    };
  });
  console.log(JSON.stringify(info, null, 1));
  if (info.error || errors.length) throw new Error(info.error || errors.join("\n"));
  if (!info.sample.nonBlank || info.sample.distinct <= 16) throw new Error("The GPU canvas is blank or has insufficient detail.");
} catch (error) {
  console.error("Visual check failed:", error);
  process.exitCode = 1;
} finally {
  try {
    await page.screenshot({ path: out });
    console.log("screenshot:", out);
  } finally {
    await browser.close();
  }
}
