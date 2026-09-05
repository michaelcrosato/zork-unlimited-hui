#include "hash"
#include "noise"
#include "color"

// A ray-marched abstraction of the current room, seen through the terminal
// glass: a chamber whose doorways open where the scene has exits, red forms
// for threats, warm lights for people, pedestals for things to handle, fog
// from pressure, and a sun that moves with the in-game clock.
struct DioramaUniforms {
  viewport: vec2f,
  time: f32,
  doors: f32,
  counts: vec4f,  // enemies, people, objects, phase
  env: vec4f,     // fog, sunAngle, night, glitch
  mood: vec4f,    // warmth, danger, roomSeed, textEdge (0..1 of width)
};

@group(0) @binding(0) var<uniform> u: DioramaUniforms;

const ROOM = vec3f(4.0, 2.3, 4.0);
const STEPS = 90;

fn sdBox(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sdSphere(p: vec3f, r: f32) -> f32 {
  return length(p) - r;
}

fn hasDoor(bit: f32) -> bool {
  return (u32(u.doors) & u32(bit)) != 0u;
}

fn enemyPos(i: f32) -> vec3f {
  let a = i * 2.1 + u.mood.z * 6.28;
  return vec3f(sin(a) * 1.7, 0.75 + 0.18 * sin(u.time * 2.6 + i * 1.3), -1.4 + cos(a) * 0.9);
}

fn npcPos(i: f32) -> vec3f {
  let side = select(-1.0, 1.0, (i % 2.0) < 1.0);
  return vec3f(side * 3.1, 1.15 + 0.05 * sin(u.time + i), -2.6 + floor(i / 2.0) * 1.4 + u.mood.z * 0.6);
}

fn pedestalPos(i: f32) -> vec3f {
  let count = max(u.counts.z, 1.0);
  return vec3f(-2.6 + (i + 0.5) * (5.2 / count), 0.28, -3.3);
}

// Free-space distance: positive in air, zero at a surface.
fn map(p: vec3f) -> f32 {
  var free = -sdBox(p, ROOM);
  // Doorways cut through the walls; the world beyond them is open air.
  if (hasDoor(1.0)) { free = max(free, -sdBox(p - vec3f(0.0, 1.05, -ROOM.z), vec3f(0.85, 1.75, 0.6))); }
  if (hasDoor(4.0)) { free = max(free, -sdBox(p - vec3f(0.0, 1.05, ROOM.z), vec3f(0.85, 1.75, 0.6))); }
  if (hasDoor(2.0)) { free = max(free, -sdBox(p - vec3f(ROOM.x, 1.05, -0.6), vec3f(0.6, 1.75, 0.85))); }
  if (hasDoor(8.0)) { free = max(free, -sdBox(p - vec3f(-ROOM.x, 1.05, -0.6), vec3f(0.6, 1.75, 0.85))); }
  // A skylight in the ceiling.
  free = max(free, -sdBox(p - vec3f(0.0, ROOM.y, -1.2), vec3f(1.1, 0.6, 1.1)));
  // Beyond the shell is open air again.
  free = max(free, sdBox(p, ROOM + vec3f(0.55)));

  for (var i = 0.0; i < u.counts.x; i += 1.0) { free = min(free, sdSphere(p - enemyPos(i), 0.36 + 0.04 * sin(u.time * 5.0 + i))); }
  for (var i = 0.0; i < u.counts.y; i += 1.0) { free = min(free, sdSphere(p - npcPos(i), 0.2)); }
  for (var i = 0.0; i < u.counts.z; i += 1.0) {
    let q = p - pedestalPos(i);
    free = min(free, sdBox(q, vec3f(0.2, 0.28, 0.2)));
    free = min(free, sdSphere(q - vec3f(0.0, 0.45, 0.0), 0.11));
  }
  return free;
}

fn normalAt(p: vec3f) -> vec3f {
  let e = vec2f(0.004, 0.0);
  return normalize(vec3f(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx),
  ));
}

fn shadow(origin: vec3f, dir: vec3f) -> f32 {
  var t = 0.06;
  var res = 1.0;
  for (var i = 0; i < 28; i++) {
    let d = map(origin + dir * t);
    res = min(res, 10.0 * d / t);
    t += clamp(d, 0.03, 0.4);
    if (res < 0.01 || t > 12.0) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

fn emissive(p: vec3f) -> vec3f {
  var glow = vec3f(0.0);
  for (var i = 0.0; i < u.counts.x; i += 1.0) {
    let d = length(p - enemyPos(i));
    glow += vec3f(1.0, 0.12, 0.05) * (0.9 + 0.3 * sin(u.time * 5.0 + i)) / (1.0 + 14.0 * d * d);
  }
  for (var i = 0.0; i < u.counts.y; i += 1.0) {
    let d = length(p - npcPos(i));
    glow += vec3f(1.0, 0.72, 0.38) * u.mood.x / (1.0 + 10.0 * d * d);
  }
  return glow;
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let night = u.env.z;
  let fogAmount = u.env.x;
  let aspect = u.viewport.x / u.viewport.y;
  // Bias the view so the room's centre sits right of the text column.
  let centre = vec2f(mix(0.5, 0.5 + u.mood.w * 0.45, 1.0), 0.47);
  let ndc = (uv - centre) * vec2f(2.0 * aspect, -2.0);
  let sway = vec3f(sin(u.time * 0.23) * 0.15, cos(u.time * 0.19) * 0.06, 0.0);
  let eye = vec3f(0.0, 1.55, 3.0) + sway;
  let forward = normalize(vec3f(0.0, 1.05, -1.6) - eye);
  let right = normalize(cross(forward, vec3f(0.0, 1.0, 0.0)));
  let up = cross(right, forward);
  let dir = normalize(forward * 1.55 + right * ndc.x + up * ndc.y);

  let sunDir = normalize(vec3f(cos(u.env.y) * 0.8, 0.75, sin(u.env.y) * 0.8));
  let dayLight = 1.0 - night;
  let skyDay = vec3f(0.62, 0.72, 0.85);
  let skyNight = vec3f(0.03, 0.04, 0.09);
  let sky = mix(skyDay, skyNight, night);

  var t = 0.0;
  var hit = false;
  var p = eye;
  var steps = 0.0;
  for (var i = 0; i < STEPS; i++) {
    p = eye + dir * t;
    let d = map(p);
    if (d < 0.002 * max(t, 1.0)) { hit = true; break; }
    t += d * 0.9;
    steps += 1.0;
    if (t > 40.0) { break; }
  }

  var colour = sky;
  if (hit) {
    let n = normalAt(p);
    let wallHue = mix(vec3f(0.42, 0.38, 0.33), vec3f(0.33, 0.36, 0.42), u.mood.z);
    var albedo = wallHue;
    // Floor grid and wall courses give the abstraction some texture.
    let onFloor = step(0.9, n.y) * step(p.y, 0.05);
    let grid = smoothstep(0.92, 1.0, max(abs(fract(p.x) - 0.5), abs(fract(p.z) - 0.5)) * 2.0);
    albedo = mix(albedo, albedo * 0.75, onFloor * grid);
    let courses = smoothstep(0.95, 1.0, abs(fract(p.y * 2.2) - 0.5) * 2.0) * (1.0 - onFloor);
    albedo = mix(albedo, albedo * 0.82, courses);
    albedo *= 0.85 + 0.15 * noise2(p.xz * 1.7 + p.yy);
    // Enemies read as wet red forms, people as warm lanterns, objects as brass.
    for (var i = 0.0; i < u.counts.x; i += 1.0) {
      albedo = mix(albedo, vec3f(0.55, 0.05, 0.03), step(length(p - enemyPos(i)), 0.45));
    }
    for (var i = 0.0; i < u.counts.y; i += 1.0) {
      albedo = mix(albedo, vec3f(1.0, 0.8, 0.5), step(length(p - npcPos(i)), 0.25));
    }
    for (var i = 0.0; i < u.counts.z; i += 1.0) {
      albedo = mix(albedo, vec3f(0.75, 0.6, 0.3), step(length(p - pedestalPos(i) - vec3f(0.0, 0.45, 0.0)), 0.14));
    }

    let sun = max(dot(n, sunDir), 0.0) * shadow(p + n * 0.02, sunDir) * dayLight;
    let skyLight = (0.5 + 0.5 * n.y) * mix(0.35, 0.08, night);
    let occlusion = 1.0 - steps / f32(STEPS) * 0.6;
    colour = albedo * (sun * vec3f(1.0, 0.95, 0.85) * 1.3 + skyLight * sky * 1.4) * occlusion;
    colour += emissive(p) * 1.6;
    // Moonlight tint at night.
    colour = mix(colour, colour * vec3f(0.6, 0.7, 1.05), night * 0.5);
  } else {
    // Sky through a doorway or the skylight, with a faint horizon.
    colour = mix(sky * 1.1, sky * 0.7, smoothstep(0.0, 0.6, dir.y));
    colour += vec3f(1.0, 0.85, 0.6) * pow(max(dot(dir, sunDir), 0.0), 60.0) * dayLight * 0.8;
  }

  // Fog thickens with pressure; danger tints it and brings lightning.
  let fogColour = mix(mix(vec3f(0.55, 0.6, 0.66), vec3f(0.08, 0.09, 0.14), night), vec3f(0.45, 0.12, 0.08), u.mood.y * 0.5);
  let fogDensity = fogAmount * (0.16 + 0.1 * noise3(p * 0.8 + vec3f(0.0, u.time * 0.15, 0.0)));
  let fogFactor = 1.0 - exp(-t * fogDensity);
  colour = mix(colour, fogColour, fogFactor);
  let flash = step(0.985, hash11(floor(u.time * 7.0) + u.mood.z)) * smoothstep(0.65, 1.0, u.mood.y);
  colour += vec3f(0.7, 0.75, 1.0) * flash * fogFactor * 1.5;

  return vec4f(colour, 1.0);
}
