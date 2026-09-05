#include "noise"
#include "color"
#include "cartographer/frame"

// The map table: a height-field mesh lit by the in-game sun, water where the
// land dips below the water level, and the fog of war drawn as an uncharted
// blueprint grid that gives way to terrain as towns are discovered.
struct TerrainOut {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> TerrainOut {
  let grid = u32(frame.params2.z);
  let ix = vertexIndex % (grid + 1u);
  let iz = vertexIndex / (grid + 1u);
  let uv = vec2f(f32(ix), f32(iz)) / f32(grid);
  let extent = frame.params.x;
  let xz = (uv - 0.5) * extent;
  let h = heightAt(uv);
  let e = 1.0 / f32(grid);
  let hx = heightAt(uv + vec2f(e, 0.0)) - heightAt(uv - vec2f(e, 0.0));
  let hz = heightAt(uv + vec2f(0.0, e)) - heightAt(uv - vec2f(0.0, e));
  let step = 2.0 * e * extent;
  var out: TerrainOut;
  out.world = vec3f(xz.x, h, xz.y);
  out.normal = normalize(vec3f(-hx / step, 1.0, -hz / step));
  out.uv = uv;
  out.position = frame.viewProj * vec4f(out.world, 1.0);
  return out;
}

@fragment
fn fs(in: TerrainOut) -> @location(0) vec4f {
  let time = frame.cameraPos.w;
  let nightness = frame.params.y;
  let water = frame.params2.x;
  let h = in.world.y;
  let slope = 1.0 - clamp(in.normal.y, 0.0, 1.0);

  var albedo: vec3f;
  var normal = in.normal;
  if (h < water) {
    let depth = clamp((water - h) / 6.0, 0.0, 1.0);
    albedo = mix(vec3f(0.16, 0.34, 0.40), vec3f(0.03, 0.09, 0.16), depth);
    let ripple = noise2(in.world.xz * 0.35 + vec2f(time * 0.25, -time * 0.17)) - 0.5;
    normal = normalize(vec3f(ripple * 0.35, 1.0, ripple * 0.25));
  } else {
    let above = h - water;
    let sand = vec3f(0.62, 0.56, 0.42);
    let meadow = vec3f(0.30, 0.42, 0.24);
    let forest = vec3f(0.16, 0.27, 0.16);
    let rock = vec3f(0.36, 0.33, 0.30);
    let snow = vec3f(0.86, 0.88, 0.90);
    let cover = fbm2(in.world.xz * 0.12 + vec2f(9.0), 3);
    albedo = mix(sand, meadow, smoothstep(0.0, 1.2, above));
    albedo = mix(albedo, forest, smoothstep(0.35, 0.7, cover) * smoothstep(0.8, 3.0, above));
    albedo = mix(albedo, rock, smoothstep(0.35, 0.7, slope));
    albedo = mix(albedo, snow, smoothstep(9.0, 13.0, above + slope * 2.0));
    // Winter: frost the meadows a little, more so at night.
    albedo = mix(albedo, albedo * vec3f(0.95, 0.97, 1.05) + vec3f(0.12), frame.params.z * 0.45);
  }

  let sun = frame.sunDir.xyz;
  let elevation = frame.sunDir.w;
  let dayLight = clamp(elevation * 1.6 + 0.15, 0.0, 1.0);
  let diffuse = max(dot(normal, sun), 0.0) * dayLight;
  let ambient = mix(0.34, 0.10, nightness);
  var lit = albedo * (ambient + diffuse * 0.95);
  if (h < water) {
    let toEye = normalize(frame.cameraPos.xyz - in.world);
    let halfVec = normalize(toEye + sun);
    lit += vec3f(0.5, 0.55, 0.6) * pow(max(dot(normal, halfVec), 0.0), 48.0) * dayLight * 0.6;
  }
  lit = mix(lit, lit * vec3f(0.55, 0.65, 1.0) + vec3f(0.0, 0.01, 0.03), nightness * 0.7);

  let dist = distance(in.world, frame.cameraPos.xyz);
  let haze = 1.0 - exp(-dist * 0.0032);
  lit = mix(lit, skyColour(nightness), haze * 0.85);

  // Uncharted: the surveyor's paper, a faint ten-unit grid, contour-like
  // banding from the true relief, and grain; it dims with the night.
  let cell = abs(fract(in.world.xz / 10.0) - 0.5) * 2.0;
  let lines = smoothstep(0.94, 1.0, max(cell.x, cell.y));
  let contour = smoothstep(0.92, 1.0, abs(fract(h * 0.5) - 0.5) * 2.0) * 0.5;
  let grain = 0.9 + 0.1 * noise2(in.world.xz * 0.45);
  var chart = mix(vec3f(0.56, 0.52, 0.42), vec3f(0.42, 0.40, 0.33), max(lines, contour)) * grain;
  chart = mix(chart, chart * vec3f(0.35, 0.4, 0.55), nightness * 0.8);
  chart = mix(chart, skyColour(nightness), haze * 0.6);
  let reveal = smoothstep(0.02, 0.55, textureSample(fogTex, fogSampler, in.uv).r);
  return vec4f(mix(chart, lit, reveal), 1.0);
}
