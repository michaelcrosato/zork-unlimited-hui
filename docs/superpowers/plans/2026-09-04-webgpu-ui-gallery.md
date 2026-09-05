# WebGPU UI Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `zork-unlimited-hui`, a monorepo that hosts any number of human interfaces for the zork-unlimited engine, shipping three tested WebGPU interfaces (Ink & Ember, Cartographer, Phosphor Diorama).

**Architecture:** One adapter (`packages/core`) turns the engine's overworld/quest sessions into a normalized `Scene`; a shared WebGPU toolkit (`packages/gpu`) and page shell (`packages/shell`) let each `uis/<slug>/` folder be a pure renderer. The engine is linked from a sibling checkout at build time; a mock client stands in when it is absent.

**Tech Stack:** TypeScript 5, pnpm workspaces, Vite 8, vitest 5, Playwright 1.63 (system Chrome, WebGPU), `wgsl_reflect` for shader parsing, `@webgpu/types`. No framework.

**Spec:** `docs/superpowers/specs/2026-09-04-webgpu-ui-gallery-design.md`

## Global Constraints

- Node 22+ (engine requirement); developed on Node 24.
- Engine path: env `ZORK_UNLIMITED_PATH`, default `../zork-unlimited`; never copy engine files into this repo.
- UIs never decide legality: every clickable thing maps to an `Action.id` the client produced.
- Every `.wgsl` file must parse with `wgsl_reflect` after `#include` expansion (unit test enforces).
- E2E (Playwright, `channel: 'chrome'`) is the local GPU gate; CI runs unit + typecheck + mock build only.
- Target: 60 fps at 2560×1440 on RTX 4070 Super; each UI reports frame time via `window.__hui`.
- Commit after every task; `main` is the only branch; push at the end of each phase.

---

## Shared contracts (defined in Task 1, used everywhere)

```ts
// packages/core/src/scene.ts
export type Phase = "tutorial" | "overworld" | "story_choice" | "journey_choice" | "quest" | "ended" | "recovery";
export type ActionKind = "move" | "travel" | "observe" | "talk" | "engage" | "use" | "service" | "choice" | "meta";
export interface Action {
  id: string;            // opaque, stable within one Scene; pass back to client.act()
  label: string;         // player-facing, short (<= 80 chars); long authored text goes in detail
  kind: ActionKind;
  group: string;         // "Advance", "Observe", "Speak", "Engage", "Act", "Service", "Road", "Dispatch", ...
  detail?: string;       // full authored text when label was shortened
  terms?: string;        // costs, checks, odds
  consequence?: string;  // what commits or changes
  disabledReason?: string;
  primary: boolean;      // true = belongs on the main deck; false = reference only
}
export interface Vitals { day: number; time: string; hp: number; hpMax: number | null; supplies: number; suppliesMax: number | null; fatigue: number; condition: string | null; money: number | null; }
export interface Pressure { id: string; title: string; value: number; band: string; description: string | null; next: string | null; }
export interface WorldNode { id: string; name: string; lat: number; lon: number; region: string; kind: string; visited: boolean; discovered: boolean; current: boolean; }
export interface WorldEdge { id: string; from: string; to: string; route: string; minutes: number; miles: number; known: boolean; }
export interface Scene {
  sceneId: string;       // changes when the place or phase changes (drives transitions)
  phase: Phase;
  place: { id: string; name: string; kicker: string; context: string };
  prose: string[];
  dialogue: { speaker: string; text: string } | null;
  result: string;        // latest consequence, full text
  actions: Action[];
  vitals: Vitals;
  pressure: Pressure[];
  goal: { text: string; guidance: string | null; status: "active" | "completed" | "none" };
  world: { nodes: WorldNode[]; edges: WorldEdge[] } | null;
  journal: string[];     // newest first
  saveStatus: "saved" | "pending" | "unavailable";
  danger: number;        // 0..1 derived from enemies, pressure, hp
  ending: { title: string; text: string; death: boolean } | null;
}
// packages/core/src/client.ts
export interface ActResult { ok: boolean; message: string }
export interface GameClient {
  readonly kind: "mock" | "live";
  scene(): Scene;
  act(id: string): ActResult;
  subscribe(listener: (scene: Scene) => void): () => void;
  reset(): void;
}
```

## File structure

```
package.json  pnpm-workspace.yaml  tsconfig.base.json  tsconfig.json
vite.config.ts  vitest.config.ts  playwright.config.ts  index.html
build/engine-plugin.ts        Vite plugin: @zork alias, virtual:zork-content, __ENGINE_AVAILABLE__
build/gallery-plugin.ts       Vite plugin: virtual:hui-gallery from uis/*/ui.json
packages/core/src/{scene,client,humanize,index}.ts
packages/core/src/mock/{mock-client,mock-world}.ts
packages/core/src/zork/{adapter,adapter.stub,overworld-actions,quest-scene,story-scene,save,content}.ts
packages/core/test/*.test.ts
packages/gpu/src/{device,fullscreen,pingpong,uniforms,particles,index}.ts
packages/gpu/src/text/{sdf,atlas,layout,renderer}.ts + text.wgsl
packages/gpu/src/wgsl/{include.ts,lib/hash.wgsl,lib/noise.wgsl,lib/color.wgsl}
packages/gpu/test/*.test.ts
packages/shell/src/{boot,a11y,input,hud,hooks,index}.ts + shell.css
packages/shell/test/*.test.ts
uis/ink-and-ember/{index.html,main.ts,ui.json,page.ts,effects.ts,wgsl/*.wgsl,test/*.test.ts}
uis/cartographer/{index.html,main.ts,ui.json,projection.ts,camera.ts,terrain.ts,roads.ts,pins.ts,fog.ts,panel.ts,wgsl/*.wgsl,test/*.test.ts}
uis/phosphor-diorama/{index.html,main.ts,ui.json,scene-params.ts,terminal.ts,wgsl/*.wgsl,test/*.test.ts}
tests/e2e/{uis.spec.ts,helpers.ts}
scripts/{new-ui.mjs,engine-path.mjs}
.github/workflows/ci.yml  README.md  LICENSE  .gitignore
```

---

### Task 0: Scaffold, tooling, CI, first push

**Files:** all root config files above, package.json for each of the three packages with empty `src/index.ts`, `index.html` gallery placeholder, `.github/workflows/ci.yml`, `LICENSE`, `README.md`.

- [ ] Write configs (pnpm workspace with `packages/*`; root depends on `@hui/core|gpu|shell` via `workspace:*`).
- [ ] `pnpm install`; `pnpm typecheck` passes on empty packages; `pnpm test` runs 0 tests without error.
- [ ] Commit `chore: scaffold monorepo`, push `main`.

### Task 1: core — Scene, humanize, MockClient

**Interfaces produced:** `Scene`, `Action`, `GameClient` (above); `humanizeId(id): string` ("relief_spear" → "Relief spear", "albany:road_warden" → "Road warden"); `createMockClient(seed?): GameClient`.

- [ ] Test `humanize.test.ts`: underscores, colons, casing, already-human strings unchanged.
- [ ] Test `mock-client.test.ts`: starts in `tutorial`; one act moves to `overworld` with ≥3 primary actions; scripted path reaches `story_choice`, `quest`, `engage` action present in a fight, `ending` non-null after finishing, `journey_choice` afterwards; `act('bogus')` returns `ok:false` and does not change `sceneId`; subscribe fires once per successful act; `reset()` returns to tutorial; `world` has ≥3 nodes and edges reference existing nodes.
- [ ] Implement `scene.ts`, `client.ts` (a `SceneStore` helper with subscribe), `humanize.ts`, `mock/mock-world.ts` (data), `mock/mock-client.ts`.
- [ ] Commit `feat(core): scene model, humanize, mock client`.

### Task 2: gpu — device, WGSL include, SDF text, passes, particles

**Interfaces produced:**
- `createGpu(canvas, opts?): Promise<Gpu>` where `Gpu = { device, context, format, size(): {w,h,dpr}, onResize(cb), destroy() }`.
- `preprocessWgsl(src, libs: Record<string,string>): string` resolving `#include "name"` once each.
- `buildSdfFromAlpha(alpha: Uint8Array, w, h, spread): Uint8Array` (8SSEDT).
- `class TextAtlas { constructor(device, font: {family, px}); glyph(ch): GlyphInfo; texture; ensure(text) }`.
- `layoutText(text, opts: {maxWidth, size, lineHeight, measure}): Layout` with `lines`, `glyphs[{ch,x,y,w,h,index}]`, `height`.
- `class TextRenderer { constructor(gpu, atlas); begin(); push(layout, {x,y,color,t0,wobble}); draw(pass, uniforms) }`.
- `class FullscreenPass { constructor(gpu, wgsl, {uniformBytes, textures?}); draw(pass, uniforms, bindings) }`.
- `class PingPong { constructor(gpu, format, w, h); read; write; swap(); resize() }`.
- `class ParticleSystem { constructor(gpu, count, wgsl); update(pass, params); draw(pass, view) }`.

- [ ] Tests: `include.test.ts` (nested include, missing include throws, no double-inclusion); `sdf.test.ts` (inside pixels > 128, outside < 128, monotonic along a ray from a filled square); `layout.test.ts` (wraps at maxWidth using a fake measure of 10px/char; never splits a word wider than a line except when the word alone exceeds the width; newline paragraphs preserved; `glyphs` rects are within `maxWidth`); `wgsl-parse.test.ts` (glob every `**/*.wgsl` in the repo, preprocess with the lib map, `new WgslReflect(src)` does not throw, at least one entry point per file).
- [ ] Implement the modules; canvas glyph rasterization uses `OffscreenCanvas` when present, else `document.createElement('canvas')`; unit tests never touch the GPU.
- [ ] Commit `feat(gpu): device, sdf text, passes, particles, wgsl libs`.

### Task 3: shell — boot, a11y mirror, input, hooks

**Interfaces produced:** `bootUi(spec: { slug, title, render: (ctx: UiContext) => Promise<UiInstance> })`; `UiContext = { gpu, client, canvas, root, a11y }`; `UiInstance = { frame(dt, t): void, onScene(scene): void, hit?(x,y): string|null, destroy() }`. `window.__hui = { ready, frames, fps, scene(), act(id), sample(): Promise<{nonBlank, distinct}>, client }`.

- [ ] Tests (jsdom): `a11y.test.ts` renders one `<button>` per primary action with the label and `aria-describedby` terms, updates on scene change, hidden visually but not from AT; `input.test.ts` maps `Digit1..9` to the nth primary action id, ignores when a disabled action is targeted, `Escape` clears focus; `hooks.test.ts` exposes `__hui` shape.
- [ ] Implement; `hud.ts` draws the small top bar (UI switcher from `virtual:hui-gallery`, client toggle mock/live, fps) in DOM.
- [ ] Commit `feat(shell): boot loop, accessibility mirror, input, e2e hooks`.

### Task 4: core — Zork adapter

**Interfaces produced:** `createZorkClient(content: ZorkContent, storage?: Storage): GameClient`; `ZorkContent = { overworld: string; packs: {path, source}[] }` from `virtual:zork-content`.

Port of the engine UI's `App.tsx` orchestration (MIT), DOM-free:
- `overworld-actions.ts`: `buildOverworldActions(view, journey, session, ctx): Action[]` covering road encounter, goal passage, dispatch (quest launch approaches, optional support inspect/talk), local movement (area exits, explore), discoveries (POIs, sites), contacts, events (authored options or investigate/resolve), jobs (authored or plain), notice board quests, services, roads; `primary` computed with the same focus rule as the engine UI (encounter > dispatch > other legal sections, roads/services reference).
- `story-scene.ts`: story choice and journey choice prompts → `phase: story_choice | journey_choice` with one `choice` action per option (plus reveal/dismiss meta actions).
- `quest-scene.ts`: `RpgObservation` → quest `Scene` (title used for kicker, inventory humanized, pressure tracks, dialogue, actions with kinds from `RpgAction.type`, blocked actions as disabled).
- `save.ts`: v2 journey save format compatible with the engine UI's `adventureforge:new-york-journey:v2` key semantics (road phase snapshot; quest phase = preQuestWorld + trail + content-bound quest save + world hash) with replay verification on load; failures → `phase: recovery` scene offering `meta` action `new-journey`.
- `adapter.ts`: `ZorkClient` composes the above; `act(id)` dispatches by id prefix (`ow:`, `story:`, `journey:`, `q:`, `meta:`).

- [ ] Test `zork-adapter.test.ts` (skips with a message when `ZORK_UNLIMITED_PATH` missing): fresh client is `tutorial`; `meta:start` → `overworld` at Albany with a `talk` action for Rowan Quill and a `travel` action; talking to Rowan yields `story_choice` with 4 options; choosing the first cycles through promise and report prompts back to `overworld`; moving to the Station exposes a `Dispatch` group; departing yields `quest` phase with `place.name` "The Steading Yard" and no raw ids in `place.kicker`/`vitals`; one accepted quest action changes `sceneId` or `result`; `save → new client from same storage` restores the same `sceneId` and `result` prefix "Resumed".
- [ ] Implement; content loading via Vite virtual module in the browser and via direct `fs` read in the vitest test (test helper builds `ZorkContent` from the sibling path).
- [ ] Commit `feat(core): zork-unlimited adapter with verified save/restore`.

### Task 5: UI 1 — Ink & Ember

- [ ] Tests: `page.test.ts` (composes Scene into text blocks with roles heading/prose/dialogue/rubric and stable ordering; marginalia positions do not overlap prose column), `effects.test.ts` (`particleParams(scene)` maps danger 0→snow 0.15 density/no embers, danger 1→embers on; ending.death→`inkRun=1`).
- [ ] Implement `wgsl/parchment.wgsl` (fbm paper + candle flicker + vignette), text via `TextRenderer` with per-glyph `t0` for wet-ink reveal, `wgsl/ink-post.wgsl` (distortion + grain + bleed), particles via `ParticleSystem` with `wgsl/embers.wgsl`.
- [ ] Manual check in Chrome; commit `feat(ui): ink-and-ember`.

### Task 6: UI 2 — Cartographer

- [ ] Tests: `projection.test.ts` (equirectangular lat/lon → plane preserves ordering, current node at origin when requested, bounds fit 247 nodes into a 200×200 plane), `camera.test.ts` (fly-to easing reaches target within duration; orbit keeps distance), `fog.test.ts` (visited nodes paint radius r, discovered r/2, others 0).
- [ ] Implement compute heightfield (`terrain.wgsl`), terrain mesh + water, road ribbons (instanced quads along edges), pins (instanced), labels (billboard SDF text), fog texture, day/night uniforms from `vitals.time`, snow particles, GPU-text side panel with actions, click hit-test on pins for travel actions when a matching `travel` action exists.
- [ ] Commit `feat(ui): cartographer`.

### Task 7: UI 3 — Phosphor Diorama

- [ ] Tests: `scene-params.test.ts` (exits → door mask bits N/E/S/W, enemies → red light count capped at 4, NPCs → warm lights, pressure max → fog 0..1, time → sun angle; death ending → glitch 1).
- [ ] Implement `diorama.wgsl` (ray-marched chamber, lights, fog, sky), `terminal.ts` (offscreen GPU text of prose + numbered actions), `crt.wgsl` (barrel, scanlines, aberration, flicker, glitch), `bloom.wgsl` (half-res separable), phosphor feedback via `PingPong`.
- [ ] Commit `feat(ui): phosphor-diorama`.

### Task 8: E2E on the GPU

- [ ] `tests/e2e/uis.spec.ts`: for each `uis/*/ui.json`, open `/uis/<slug>/?client=mock`, expect `__hui.ready`, adapter present, frames > 30 within 5 s, `sample()` non-blank and > 16 distinct colors, first primary action via `__hui.act` changes `sceneId` or `result`, no `console.error`; if `__ENGINE_AVAILABLE__`, repeat with `?client=live` and assert `place.name` is "Albany City" after the tutorial.
- [ ] Run `pnpm test:e2e` on this machine; fix defects; record fps.
- [ ] Commit `test(e2e): webgpu smoke per ui`.

### Task 9: Gallery, scaffold script, docs, CI, push

- [ ] `scripts/new-ui.mjs <slug>` copies a template UI; test by scaffolding `uis/_template-check` in a temp dir (not committed).
- [ ] README: what this is, how to link the engine, run, add a UI, test; per-UI notes.
- [ ] CI green on GitHub (unit + typecheck + mock build). Push.
