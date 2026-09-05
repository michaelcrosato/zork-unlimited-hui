# Three additional WebGPU interfaces

These interfaces extend the existing gallery and use its unchanged `Scene` /
`GameClient` boundary, including the linked zork-unlimited / Adventure Forge
engine and its browser saves. No game rules or content are duplicated.

- **Astral Orrery**: an astronomical instrument with numbered, clickable action
  satellites. GPU star fields, engraved orbital rings and instanced SDF graphics
  frame a separately scrollable reading pane and a complete action list.
- **Lantern Theatre**: a panoramic paper theatre, with procedural velvet curtains,
  layered scenery, scene-driven spotlights and compute-simulated dust. The script
  and cue cards have independent reading areas.
- **Tideglass**: an expedition instrument with a compute-simulated water surface.
  Scene changes and pointer motion excite waves; refracted light and a health
  level fill the instrument. Separate story, action and expedition panels keep
  decisions, pressure and the journal close at hand.

Shared panel composition preserves all authored prose, dialogue, endings,
results, goals, pressure descriptions, journal entries and action details.
Primary numbering follows the shell's keyboard contract; secondary actions and
disabled explanations remain visible. Panels support wheel, touch drag,
Page Up/Down, Home/End and focus-following from the accessibility mirror.
Narrow screens stack the panels into one scrollable reading surface. Reduced
motion freezes ambient animation while keeping scene updates and input active.

Verification: typecheck, the full unit/WGSL suite, production build, shared GPU
gate for all six interfaces, and dedicated browser journeys for the new three
(pointer and keyboard input, scrolling, mobile, mock ending, the complete live
Wolf-Winter prepared HUNT route, journey ending, and save continuity across
reloads and interface switches). Screenshots and hardware/frame-rate results
are captured locally by `pnpm test:e2e`.

Implementation uses the existing WebGPU helpers and the
[WGSL storage-texture contract](https://www.w3.org/TR/WGSL/#texturestore).
Tideglass integrates a 256×256 height/velocity grid in two `rgba16float` storage
textures, then shades from its gradients. Orrery's primary action shortcuts
stay fixed while the background turns, and its complete card list has no
eight-action limit. Theatre's decorative stage renders up to five path lights;
its caption and card list retain the full available path count.

## Local verification — 2026-09-05

- `pnpm typecheck`: passed, including the engine-typed adapter.
- `pnpm test`: 156 tests passed across 20 files, including all WGSL parsing and
  the new layout, content-preservation and scene-parameter tests.
- `pnpm test:e2e`: 29 tests passed. All six interfaces render and accept actions
  with mock and live clients. Each addition completes both the mock journey and
  the live Wolf-Winter route, then ends the journey. Mobile touch/wheel input,
  focus scrolling, disabled choices, reduced motion and cross-interface saves
  also passed.
- Production builds passed with the sibling engine linked and with an absent
  engine override (the latter written to `test-results/mock-build`).
- Each addition measured 144 fps in the 2560×1440 headless Chrome smoke check.
  The browser reported an NVIDIA Lovelace adapter. This is a local measurement,
  not a guarantee for other devices.

Browser screenshots are in `test-results/screens/`: `<slug>-mock.png`,
`<slug>-live-quest.png`, `<slug>-live-complete.png`, `<slug>-mobile.png`, and
`<slug>-1440p.png`. This directory is ignored by Git and refreshed by the suite.
