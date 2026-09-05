#include "noise"
struct Glass { viewport: vec2f, time: f32, danger: f32, center: vec2f, radius: f32, health: f32, supplies: f32, known: f32, suppliesKnown: f32, pad: f32 };
@group(0) @binding(0) var<uniform> u: Glass;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var water: texture_2d<f32>;
@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pixel = uv * u.viewport;
  let p = (pixel - u.center) / max(12.0, u.radius);
  let r = length(p);
  let angle = atan2(p.x, -p.y) + 3.14159265;
  let fieldUv = p * 0.47 + 0.5;
  let h = textureSampleLevel(water, linearSampler, fieldUv, 0).r;
  let dx = textureSampleLevel(water, linearSampler, fieldUv + vec2f(0.008,0), 0).r - h;
  let dy = textureSampleLevel(water, linearSampler, fieldUv + vec2f(0,0.008), 0).r - h;
  let normal = normalize(vec3f(-dx * 30.0, -dy * 30.0, 1));
  var color = vec3f(0.012, 0.043, 0.049);
  let grid = min(abs(fract(pixel.x / 44.0) - 0.5), abs(fract(pixel.y / 44.0) - 0.5));
  color += vec3f(0.03, 0.15, 0.14) * (1.0 - smoothstep(0.008, 0.023, grid)) * 0.16;
  let mint = mix(vec3f(0.16, 0.79, 0.64), vec3f(0.95, 0.42, 0.2), u.danger * 0.75);
  color += mint * exp(-r * r * 0.8) * 0.07;
  let aa = 1.3 / max(12.0, u.radius);
  for (var i = 0; i < 3; i++) {
    let ring = 1.025 + f32(i) * 0.07;
    color += mint * (1.0 - smoothstep(aa * 0.2, aa, abs(r - ring))) * select(0.26, 0.7, i == 0);
  }
  let ticks = pow(max(0.0, cos(angle * 60.0)), 28.0) * smoothstep(1.19, 1.2, r) * (1.0 - smoothstep(1.24, 1.26, r));
  color += mint * ticks * 0.55;
  color += vec3f(0.85, 0.7, 0.37) * (1.0 - smoothstep(aa, aa * 2.0, abs(r - 1.145))) * step(angle / 6.2831853, u.supplies) * u.suppliesKnown;
  if (r < 1.0) {
    let folds = fbm2(p * 3.0 + vec2f(dx, dy) * 7.0 + u.time * 0.018, 3);
    let caustic = pow(max(0.0, 1.0 - abs(sin((folds + h * 0.8) * 23.0))), 9.0);
    let level = 1.0 - 2.0 * u.health + h * 0.09 + sin(p.x * 6.0 + u.time * 0.7) * 0.018;
    let filled = smoothstep(level - 0.025, level + 0.025, p.y);
    var liquid = mix(vec3f(0.023, 0.11, 0.15), mint * 0.29, (1.0 - p.y) * 0.5);
    liquid += mint * caustic * 0.3 + vec3f(0.6, 0.95, 0.9) * pow(max(0.0, dot(normal, normalize(vec3f(-0.5,-0.6,1.0)))), 28.0) * 0.12;
    color = mix(vec3f(0.02, 0.055, 0.07), liquid, mix(0.6, filled, u.known));
    color += mint * exp(-abs(p.y - level) * 90.0) * 0.65 * u.known;
    color *= 0.7 + 0.3 * sqrt(max(0.0, 1.0 - r * r));
    color += vec3f(0.4, 0.9, 0.83) * exp(-abs(r - 0.97) * 75.0) * max(0.0, -p.x - p.y) * 0.38;
  }
  return vec4f(color, 1);
}
