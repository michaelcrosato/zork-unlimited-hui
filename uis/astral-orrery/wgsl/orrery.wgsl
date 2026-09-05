#include "noise"
struct Sky { viewport: vec2f, time: f32, danger: f32, center: vec2f, radius: f32, day: f32, death: f32, pad0: f32, pad1: f32, pad2: f32 };
@group(0) @binding(0) var<uniform> u: Sky;
@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pixel = uv * u.viewport;
  let p = (pixel - u.center) / max(20.0, u.radius);
  let r = length(p);
  let angle = atan2(p.y, p.x);
  let cloud = fbm2(uv * vec2f(5, 3) + vec2f(u.time * 0.006, u.day * 0.1), 4);
  var color = mix(vec3f(0.018, 0.024, 0.057), vec3f(0.1, 0.1, 0.22), cloud * cloud);
  color += vec3f(0.19, 0.09, 0.23) * pow(cloud, 4.0) * exp(-r * 0.3);
  let cell = floor(pixel / 32.0);
  let star = hash22(cell);
  let distance = length(fract(pixel / 32.0) - star);
  let sparkle = pow(max(0.0, 1.0 - distance * 23.0), 3.0) * step(0.5, hash21(cell + 8.0));
  color += vec3f(0.65, 0.75, 1.0) * sparkle * (0.65 + 0.25 * sin(u.time * 0.6 + star.x * 30.0));
  let gold = mix(vec3f(0.75, 0.54, 0.28), vec3f(0.9, 0.26, 0.19), clamp(u.danger, 0.0, 1.0));
  let aa = 1.3 / max(20.0, u.radius);
  for (var i = 0; i < 5; i++) {
    let ring = 0.42 + f32(i) * 0.195;
    color += gold * (1.0 - smoothstep(aa * 0.3, aa, abs(r - ring))) * select(0.24, 0.65, i == 3);
  }
  let ticks = pow(max(0.0, cos(angle * 90.0)), 24.0) * smoothstep(1.13, 1.15, r) * (1.0 - smoothstep(1.2, 1.22, r));
  color += gold * ticks * 0.75;
  let ellipse = length(vec2f(p.x * 0.72, p.y * 1.9));
  color += gold * (1.0 - smoothstep(aa * 0.2, aa, abs(ellipse - 1.0))) * 0.26;
  let hand = vec2f(cos(u.time * 0.04), sin(u.time * 0.04));
  let ray = abs(p.x * hand.y - p.y * hand.x);
  color += gold * exp(-ray * 130.0) * step(0.0, dot(p, hand)) * smoothstep(0.5, 0.55, r) * (1.0 - smoothstep(1.1, 1.14, r)) * 0.6;
  color += gold * exp(-r * r * 7.0) * 0.09;
  return vec4f(color * (1.0 - u.death * 0.3), 1);
}
