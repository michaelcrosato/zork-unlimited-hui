# zork-unlimited-hui

Human interfaces for [zork-unlimited](https://github.com/michaelcrosato/zork-unlimited),
the deterministic text-RPG engine. This repo is deliberately **separate from the
game**: the engine and its content are never copied here. Each interface is an
interpreter that runs on top of the engine's structured observations and legal
actions and decides only how to *show* them. Any number of interfaces can live
side by side, and all of them play the same game with the same saves.

Three WebGPU interfaces ship today, each a different answer to "what should a
primarily text-based RPG look like on a modern GPU":

| Interface | Idea | Techniques |
| --- | --- | --- |
| **Ink & Ember** (`uis/ink-and-ember`) | An illuminated manuscript. Prose is written in wet ink on candlelit parchment; choices are red rubrics; snow and embers answer the story's danger. | SDF typography with per-glyph animation, 120k compute particles, procedural parchment, post-process ink bleed on death |
| **Cartographer** (`uis/cartographer`) | A lit map table. The 247-town New York road graph as terrain, roads, and beacons; fog of war lifts over a surveyor's chart as you travel; the sky follows the in-game clock. | Compute-generated height field, instanced ribbons and pins, MSAA 4x, fog-of-war texture, camera flights, collision-free SDF labels |
| **Phosphor Diorama** (`uis/phosphor-diorama`) | A slow-phosphor terminal in a dark room, with the current scene ray-marched behind the glass: doorways where there are exits, red forms for threats, warm lights for people. | Ray marching, phosphor persistence feedback, separable bloom, CRT composite (curvature, fringes, scanlines, glitch) |

All three run at the display's refresh rate (144 fps measured headless) on an
RTX 4070 Super and pass the same GPU test gate.

## How it fits together

```
packages/core    Scene model, GameClient contract, mock world, zork-unlimited adapter
packages/gpu     WebGPU toolkit: device, SDF text atlas + renderer, fullscreen passes,
                 ping-pong targets, compute particles, WGSL include libraries
packages/shell   Page shell: client boot, frame loop, accessibility mirror, keyboard,
                 HUD, window.__hui test hooks, shared text-page composer
uis/<slug>/      One folder per interface: index.html, main.ts, render.ts, ui.json, wgsl/
tests/e2e        Playwright + your installed Chrome + your GPU
```

- **The Scene** (`packages/core/src/scene.ts`) is the one contract. A client turns
  the engine into `{ phase, place, prose, dialogue, result, actions, vitals,
  pressure, goal, world, journal, ending, danger }`; an interface renders that
  and calls `client.act(action.id)`. Interfaces never decide legality.
- **Two clients.** `createMockClient()` is a small original world (The Lantern
  Road) that exercises every phase and action kind, so interfaces can be built,
  demoed and tested without the game. The live adapter (`packages/core/src/zork/live`)
  compiles the engine into the page and ports the engine UI's orchestration:
  overworld, Station dispatch, story and journey pauses, embedded quests, and the
  verified browser save (byte-compatible with the engine UI's `v2` format).
- **The shell** owns everything an interface should not have to: the canvas and
  GPU device, client selection (`?client=live|mock`), the frame loop, number-key
  and click input, a visually hidden DOM mirror with a real button per action for
  screen readers, and `window.__hui` for automation.

## Linking the engine

The engine is read from a sibling checkout at build time:

```bash
git clone https://github.com/michaelcrosato/zork-unlimited ../zork-unlimited   # sibling folder
cd ../zork-unlimited && npm install && cd -
pnpm engine:where          # prints the resolved path and whether it is linked
```

`ZORK_UNLIMITED_PATH` overrides the default `../zork-unlimited`. When the engine
is absent the build falls back to the mock client and everything still works;
that is how CI runs.

## Run

```bash
pnpm install
pnpm dev                   # http://127.0.0.1:5180 — the gallery; pick an interface
pnpm build && pnpm preview # production build, served at http://127.0.0.1:4173
```

Open an interface with `?client=mock` to play the mock world, or `?client=live`
for the game when the engine is linked. Number keys 1–9 fire the numbered
choices; click a choice to take it; scroll to read; in Cartographer, drag to
orbit, wheel to zoom, click a town with a road to travel there.

## Test

```bash
pnpm test            # vitest: core, gpu, shell, every interface's pure modules,
                     #   every .wgsl file parsed after include expansion,
                     #   and the live adapter against the real engine when linked
pnpm typecheck       # root project, plus the engine-typed adapter when linked
pnpm test:e2e        # Playwright in your installed Chrome with WebGPU on your GPU:
                     #   for every uis/*/ and every client, boots, renders 30+ frames,
                     #   reads pixels back, takes an action, checks fps and a clean console
node scripts/screenshot-ui.mjs <slug> [mock|live] [out.png] [actionId,...]
                     # with `pnpm preview` running: console log, GPU info, a screenshot
```

CI (`.github/workflows/ci.yml`) runs install, typecheck, unit tests and a mock
build. The GPU gate is local by design: hosted runners have no usable WebGPU.

## Add an interface

```bash
pnpm new-ui my-idea "My Idea"
```

That scaffolds `uis/my-idea/` with a working interface (a shaded backdrop plus
the shared text page), a manifest and a unit test. The gallery, the build and
the e2e suite pick the folder up automatically; nothing else is edited. Then
replace `render.ts` with your own renderer. The contract is small:

```ts
render(ctx: UiContext): Promise<UiInstance>
// ctx: { gpu, client, canvas, root, slug, hooks, params, notice }
// instance: { frame(dt, time), onScene?(scene), hit?(x, y) => actionId | null, hover?(x, y), destroy?() }
```

Shaders may `#include "noise"`, `"hash"`, `"color"` from `packages/gpu/src/wgsl/lib`,
or their own `uis/<slug>/wgsl/lib/<name>.wgsl` as `"<slug>/<name>"`; every
`.wgsl` file in the repo is parsed in the unit suite.

## Design notes

- The interfaces present, they do not edit: authored text is shown in full
  (long commands are shortened to a label with the full text in `detail`), raw
  engine ids are humanised only where the engine offers nothing better, and the
  latest result is never truncated.
- GPU work is where it pays: typography and layout are laid out on the CPU and
  drawn as instanced SDF quads; particles, terrain and post-processing live
  entirely on the GPU.
- The spec and plan that produced this repo are in `docs/superpowers/`.

MIT © 2026 Michael Crosato.
