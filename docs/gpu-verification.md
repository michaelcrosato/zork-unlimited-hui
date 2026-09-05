# GPU and visual verification

Use the installed Chrome with its default graphics backend and WGSL features.
The earlier test flags included `--enable-unsafe-webgpu`, which enabled
`swizzle_assignment` on this machine. The same browser without those flags
rejected `pigment.rgb = ...` and `item.point.xy = ...`. Dawn introduced that
language feature behind its unsafe experimental gate
([Dawn change](https://dawn.googlesource.com/dawn.git/+/bb10f608b42cda43ddf1efb364a47d0511077358)).
Both shaders now reconstruct the whole vector and preserve the original math.

## Run and inspect

```sh
pnpm test         # CPU-only WGSL parsing and portability guard, plus other unit tests
pnpm test:e2e     # fresh production build; normal Chrome; all gameplay and visual tests
pnpm test:visual  # just the four desktop/phone visual cases
pnpm test:report  # open the most recent HTML browser report
```

Each browser command builds and starts its own preview on port 4173; stop any
manual preview there first. The dev server on port 5180 can remain running.
WebGPU must work in normal Chrome; enabling unsafe experimental features would
invalidate this compatibility check.

The automatic GPU fixture records `getCompilationInfo()` for every shader
module, uncaptured device errors, and the shell's error state. Compiler errors
fail the test even if the frame counter advances. The report includes shader
labels, line/column diagnostics and the browser's WGSL features. Failed tests
retain screenshots and traces. Live dice tests also record video.

The visual suite compares eight checked-in reference images: arrival and the
first action for both interfaces at 1600×1000 and 390×844. Reduced motion freezes
the ambient simulation for repeatable images; only the changing FPS header is
cropped out. Pixel readback also rejects a blank canvas. Motion-enabled journeys,
travel transitions, d6/d20 reveals and replay remain covered by the other tests.

Inspect the rendered text, artwork and controls in the report, and review the
expected, actual and difference images for a mismatch. Reference images were
reviewed on Windows with the installed Chrome and NVIDIA Lovelace GPU. Font,
browser or driver changes may need investigation; the small pixel tolerance is
not a promise of identical rendering on other machines. After reviewing an
intentional visual change, refresh references with:

```sh
pnpm test:visual --update-snapshots
```

For a standalone capture, start `pnpm preview` after a build and run
`node scripts/screenshot-ui.mjs painted-wild mock`. This helper uses normal
Chrome, returns a nonzero exit code on boot, console, action or blank-render
failures, and saves the failure screenshot as well as successful captures.

## Regression protection

The reflection parser alone accepts multi-component assignment targets, so the
unit suite also walks the WGSL AST and rejects swizzle writes. Write a complete
vector or one component at a time. Component-like field names such as `xy` or
`rgb` are reserved for vector access by this conservative rule. Reads such as
`pigment.rgb` remain valid. This guard runs in hosted CI without a GPU.

Before the shader fixes, both the new unit guard and the normal-browser visual
tests failed on the exact reported assignments. The browser failures included
the compiler diagnostics and rendered error screenshots.
