# The Painted Wild and Rift Overdrive

The second brief asks for two ambitious, expressive play surfaces: one artistic,
one energetic. These are new interfaces alongside the existing six. The game
and saves remain the source of truth.

The Painted Wild is a living print: flowing ultramarine, vermilion and gold,
compute-advection pigment, tens of thousands of directional brush marks, large
editorial typography and organic transitions that repaint the previous scene.
Its composition and palette evolve with place, danger and journey progress.

Rift Overdrive is a kinetic battle stage: ray-marched architecture, a deep portal,
hundreds of thousands of compute-driven shards, HDR light, bloom, chromatic
shockwaves, travel rushes and a climactic completion sequence. Combat changes
the composition and the reactor's behaviour.

Both stage actual d6 combat rolls and d20 skill checks with lit, tumbling 3D
dice, a reveal of the exact face, arithmetic and outcome, then an impact. The
engine currently emits these numbers as canonical narration; the adapter parses
only the current action's recognised engine messages. It never rolls again,
guesses dice from damage, or replays old journal entries as new results. The mock
world's fixed damage is presented as fixed damage, without invented dice.

Rendering pipeline: compute simulation → half-resolution HDR artwork →
full-resolution dice with depth → quarter-resolution bloom → history transition
and optical composite → full-resolution typography. Text and current action
targets remain clear during bloom and chromatic impacts. The type atlases use
64-pixel body glyphs and 128-pixel display glyphs for large poster titles.

Movement wipes the previous artwork into a new composition. The Painted Wild
changes its petal structure and gold with visited places and completion, while
danger shifts pigment. Rift Overdrive changes gate orientation by location,
responds to action hover, brings its action column forward in combat, and opens
the gates into a blue-white burst on completion. Pointer motion deflects brush
marks and shards. These are visual interpretations, not new gameplay rules or
an asserted percentage of quest completion.

Rolls tumble for 1.4 seconds, settle on the reported face, and show arithmetic
and outcome before clearing. Player and enemy dice appear together; larger
groups are staged two at a time. Replay repeats only that presentation. Skip
ends it immediately. Reduced motion freezes ambient simulation and optical
effects and shows the settled result immediately. Complete action narration,
including each roll and consequence, remains in the scrollable reading surface
and accessibility mirror. Presentation telemetry is ephemeral and never saved
as a new roll or recovered from an old journal.

Verification must cover the full live and mock journeys, real dice values and
both combat directions, a real skill check, no stale roll after reload, visible
transition/impact frames, evolving artwork, accessible complete text, touch and
keyboard input, reduced motion, clean GPU validation and 1440p performance.
The six existing interfaces must keep passing their tests.

## Implementation and verification

The initial 201 unit tests and 47 browser tests passed, but the browser launcher
enabled unsafe experimental WGSL syntax. Those results missed the swizzle
assignment errors in normal Chrome. Painted Wild's pigment update and the shared
vector field now use whole-vector writes. Browser tests use Chrome's default
features and inspect shader compilation directly; unit tests reject swizzle
writes even without a GPU. Four visual tests compare eight reviewed desktop and
phone images. See [GPU and visual verification](gpu-verification.md) for commands
and the regression evidence.

After correction, 204 unit tests and all 51 browser tests passed in normal
Chrome, including all eight image comparisons. TypeScript and the linked-engine
production build passed. The dice-test action helper also waits for a rendered
frame, so it cannot miss a short animation-start window.

Shared modules live in `packages/gpu/src/{cinematic,dice,vector-field}` and
`packages/shell/src/{drama,showpiece,showpiece-layout}`. Interface-owned WGSL
supplies the pigment simulation and painting or ray-marched architecture.
The adapter reads the linked engine's canonical current-action narration and
validates roll bounds and arithmetic; unrecognised narration remains text.
GPU validation errors are reported through the HUD and automation hooks, so
a frame counter cannot conceal a failed shader.

The browser suite covers both complete mock journeys and the live Wolf-Winter
prepared route, save reload/switching, pointer targets, disabled actions, wheel,
touch, keyboard, mobile layout and frozen reduced-motion frames. Dedicated
cinematic tests exercise a real paired d6 strike/counterattack and the real
DRIVE d20 check, compare tumble and reveal frames, capture travel transitions,
verify replay leaves the scene unchanged, and confirm no stale dice on reload.
Their screenshots and recorded WebM clips are written under `test-results/`.

On this Windows machine's NVIDIA Lovelace GPU, both interfaces reached the
display's 144 FPS at 2560×1440 in the browser performance check. This is a local
measurement, not a guarantee for other adapters. Artwork renders at half the
canvas resolution; dice and text stay at full resolution. The existing large
live-engine bundle warning remains unchanged.
