# zork-unlimited-hui: a gallery of WebGPU human interfaces for zork-unlimited

Date: 2026-09-04. Status: approved by directive (the owner's `/goal` asked for
this to be built without pausing for review; assumptions are listed at the end
so they can be overruled).

## Purpose

`zork-unlimited` is a deterministic, AI-coded text RPG engine. Its own `ui/`
folder is a single React view that the engine repo treats as an afterthought.
This repo is the opposite bet: the **human interface is a separate product**
that runs *on top of* the engine as an interpreter, and there can be **any
number of them**. The first deliverable is three strong, distinct WebGPU
interfaces, each tested, targeting an RTX 4070 Super in Chrome.

The engine is never copied here. Every UI consumes the same normalized
`Scene` model produced by one adapter, so a new UI is a new folder, not a new
integration.

## Non-goals

- No changes to `zork-unlimited`. Anything the engine does not expose (for
  example an irreversibility flag per action) is worked around in the adapter
  or presented as-is.
- No new game content, rules, or prose rewrites. The UIs render what the engine
  says; they may *present* it differently (grouping, emphasis, motion), never
  change legality or outcomes.
- No React. Each UI is plain TypeScript over WebGPU with a thin DOM layer for
  accessibility and input.
- No server. Everything runs in the browser; the engine is compiled into the
  page the same way the engine's own UI does it.

## Architecture

```
zork-unlimited-hui/
  packages/core     Scene model, GameClient interface, mock client, zork adapter
  packages/gpu      WebGPU toolkit: device, SDF text, passes, particles, WGSL libs
  packages/shell    Page shell shared by UIs: client boot, a11y mirror, input, HUD
  uis/<slug>/       One folder per interface (index.html, main.ts, ui.json, wgsl/)
  tests/e2e/        Playwright + system Chrome WebGPU smoke tests (local, on the GPU)
  scripts/          new-ui scaffold, engine-present gate
  docs/             this spec, plans, per-UI notes
```

pnpm workspaces, one Vite root, one vitest config, one Playwright config.

### Engine linkage (the "interpreter" boundary)

- `ZORK_UNLIMITED_PATH` (default `../zork-unlimited`) names a sibling checkout.
- A Vite plugin exposes two things:
  - alias `@zork/*` → `<path>/src/*` (the engine's browser-safe modules: core,
    rpg, world, persist, api types), and
  - virtual module `virtual:zork-content` exporting the overworld manifest JSON
    and the twelve quest pack YAML sources as strings, read from `<path>/content`.
- If the sibling checkout is absent, the alias `@zork-adapter` points at a stub
  and the UIs run against the **mock client**. This is how CI and GitHub Pages
  work without the game, and how a UI author can iterate without the engine.
- Client selection at runtime: `?client=live|mock` in the URL; default `live`
  when the build had the engine, else `mock`.

### `packages/core`

- `Scene`: the one type every UI renders.
  - `phase`: `tutorial | overworld | story_choice | journey_choice | quest | ended | recovery`
  - `place`: `{ id, name, kicker, regionOrQuest }`
  - `prose: string[]`, `dialogue?: { speaker, text }`
  - `result: string` (latest consequence, full text, never truncated)
  - `actions: Action[]` where `Action = { id, label, verb, group, tone, terms?, consequence?, disabledReason?, weight: 'primary'|'secondary'|'reference' }`
  - `vitals: { day, time, hp, hpMax?, supplies, suppliesMax?, fatigue, condition? }`
  - `pressure: { id, title, value, bandLabel, bandDescription?, next? }[]`
  - `goal: { text, guidance?, status }`
  - `world?: { nodes: {id,name,lat,lon,region,kind,visited,discovered,current}[], edges: {from,to,route,minutes,miles}[] }` (overworld phases only; drives Cartographer)
  - `journal: string[]`, `saveStatus`
- `GameClient` interface: `scene(): Scene`, `act(id): Promise<ActResult>`, `subscribe(fn)`, `reset()`, plus `capabilities`.
- `MockClient`: a small hand-authored world (three places, one quest room chain,
  one fight, one story choice, one ending) that exercises every `phase` and
  every `Action.tone`. Deterministic. Used by unit tests, e2e, and demos.
- `ZorkClient` (the adapter): a DOM-free port of the orchestration in the
  engine's `ui/src/App.tsx` (MIT). It owns `OverworldSession`, the embedded
  quest `GameSession` equivalent, story/journey choices, quest start and
  fold-back, and the localStorage journey save with replay verification. It
  emits `Scene`s. Where the engine hands back raw ids (room ids, item ids), the
  adapter substitutes titles/names when the observation carries them.
- Tests (vitest, node): scene invariants for the mock client across a scripted
  playthrough; adapter smoke against the real engine when the sibling checkout
  exists (skipped with a message otherwise): tutorial → registration → Station
  → Wolf-Winter first room → one accepted action → save/restore round trip.

### `packages/gpu`

- `createGpu(canvas)`: adapter/device with feature reporting, `preferredFormat`,
  resize handling, lost-device recovery hook.
- `TextAtlas`: Canvas2D glyph rasterization at 48px into an atlas, converted to
  a signed distance field on the CPU (8SSEDT), uploaded once per font; lazily
  adds glyphs.
- `TextRenderer`: instanced SDF quads, per-glyph attributes (position, uv,
  color, `t0` birth time, `wobble`), one draw per text layer. `layout()` does
  word wrap and returns glyph runs with rectangles for hit testing.
- `Fullscreen`: helper for fragment-only passes with a uniform block.
- `PingPong`: two textures for feedback effects.
- `Particles`: compute-shader particle system with spawn/update/render pipelines
  and a small uniform block; 200k particles budget.
- `wgsl/`: shared snippets (hash, value/simplex noise, fbm, sRGB, tonemap)
  inlined into shaders by a tiny `#include` preprocessor at build time.
- Tests: layout wrapping, SDF monotonicity on a synthetic glyph, `#include`
  resolution, and every `.wgsl` file in the repo parses with `wgsl_reflect`.

### `packages/shell`

- `bootUi({ mount, render })`: picks the client, creates the canvas, wires
  `resize`, runs the frame loop, exposes `window.__hui` (ready, frames, scene,
  act, sample) for e2e, and mounts the **accessibility mirror**: an offscreen
  DOM list of the current prose and a real `<button>` per action, so screen
  readers and keyboard users get the full game even though pixels come from
  the GPU. Number keys 1–9 fire the first nine actions; `Tab` cycles.
- Also renders the tiny gallery header (switch UI, switch client, fps).

### The three interfaces

Each UI must: render the live game end to end (tutorial → Albany → Station →
Wolf-Winter → an ending or death → journey choice), present every `Action`
kind, hold 60 fps at 2560×1440 on the 4070 Super, use at least two distinct
GPU techniques, and pass the shared e2e suite plus its own unit tests.

1. **Ink & Ember** (`uis/ink-and-ember`) — the manuscript.
   Prose is the hero. Parchment is a procedural fBm fragment shader with
   candle flicker and vignette. Text is instanced SDF glyphs written in as wet
   ink that sharpens over ~300 ms per glyph; choices are marginalia in red
   rubric with a glow on hover. A compute particle system (snow and embers,
   200k) is driven by the scene: pressure tracks raise snow density, danger
   adds embers, a death ending makes the ink run via a screen-space distortion
   pass. Techniques: SDF typography, compute particles, post-process.

2. **Cartographer** (`uis/cartographer`) — the atlas table.
   The overworld graph (247 nodes with real lat/lon, 344 roads) becomes a lit
   3D map: a heightfield generated by a compute shader from fBm seeded by
   node positions, water below sea level, roads as instanced ribbons, towns as
   instanced pins with billboarded SDF labels, fog-of-war as a texture the
   discovery state paints into, day/night from in-game time, snow when the
   season calls for it. Travel flies the camera along the road. Prose and
   actions live in a GPU-text side panel. Techniques: compute heightfield,
   instanced geometry with depth and lighting, fog-of-war texture updates,
   camera animation, MSAA.

3. **Phosphor Diorama** (`uis/phosphor-diorama`) — the terminal with a
   world behind the glass.
   A fullscreen ray-marched SDF scene abstracts the current room: a chamber
   with an opening per exit direction, warm lights for people present, pulsing
   red forms for enemies, pedestals for objects, fog and lightning from pressure,
   sky from time of day. Over it, terminal text (prose, numbered choices) is
   rendered to an offscreen target and composited through a CRT chain:
   barrel distortion, scanlines, phosphor persistence via ping-pong feedback,
   half-res bloom, chromatic aberration, and a glitch tear on damage or death.
   Techniques: ray marching, multi-pass post-processing with feedback, offscreen
   text compositing.

### Testing

- Unit: vitest in node (core, gpu math/layout, shell logic, WGSL parse).
- E2E: Playwright with `channel: 'chrome'` (the installed Chrome, WebGPU on,
  runs on the RTX). For each UI: page loads, `navigator.gpu` adapter present,
  `__hui.frames > 30`, a GPU readback shows non-blank, non-uniform pixels,
  `__hui.act(firstAction)` changes the scene, no console errors. Runs against
  the mock client by default and the live client when the engine is present.
- CI (GitHub Actions): install, unit tests, typecheck, build with mock. E2E is
  documented as a local gate (`pnpm test:e2e`) because hosted runners have no
  usable WebGPU.

### Adding a UI

`pnpm new-ui <slug>` scaffolds `uis/<slug>/` from a template (index.html,
main.ts using `bootUi`, ui.json, one WGSL file, one unit test). The root Vite
config globs `uis/*/index.html`, the gallery page reads every `ui.json`, and
the e2e suite iterates the same glob, so nothing else is edited.

## Assumptions to overrule if wrong

1. "Human UI" means the human-facing play surface; agents keep using MCP.
2. Sibling-checkout linkage (`../zork-unlimited`) is acceptable; no submodule.
3. In-browser engine compilation (like the engine's own UI) is the intended
   "interpreter" model, not a network protocol.
4. Three UIs with a shared adapter counts as "any number of UIs" infrastructure.
5. MIT license, matching the engine.
