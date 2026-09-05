#include "noise"
struct Stage { viewport: vec2f, time: f32, danger: f32, rect: vec4f, seed: f32, doors: f32, company: f32, curtain: f32, extra: vec4f };
@group(0) @binding(0) var<uniform> u: Stage;
@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pixel = uv * u.viewport;
  let p = (pixel - u.rect.xy) / u.rect.zw;
  var color = vec3f(0.041, 0.026, 0.027) + noise2(pixel * 0.016) * 0.009;
  if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) { return vec4f(color, 1); }
  let warm = vec3f(0.43, 0.25, 0.2);
  let cold = vec3f(0.13, 0.17, 0.21);
  color = mix(cold, warm, p.y) * (1.0 - u.danger * 0.3);
  let aspect = u.rect.z / u.rect.w;
  let moon = length((p - vec2f(0.74, 0.29)) * vec2f(aspect, 1));
  color += vec3f(0.86, 0.64, 0.32) * exp(-moon * 6.0) * 0.24;
  color = mix(color, vec3f(0.91, 0.75, 0.47), 1.0 - smoothstep(0.12, 0.124, moon));
  for (var i = 0; i < 5; i++) {
    let layer = f32(i);
    let hill = 0.45 + layer * 0.088 + sin(p.x * (12.0 + layer * 3.0) + u.seed + layer) * (0.08 - layer * 0.009)
      + noise2(vec2f(p.x * 15.0 + u.seed, layer * 7.0)) * 0.06;
    let paper = mix(vec3f(0.23, 0.19, 0.18), vec3f(0.055, 0.06, 0.068), layer / 4.0);
    color = mix(color, paper, smoothstep(hill - 0.004, hill, p.y));
    color += vec3f(0.51, 0.34, 0.19) * exp(-abs(p.y - hill) * 350.0) * 0.2;
  }
  // Open doorways represent available move / travel actions, without inventing locations.
  for (var i = 0; i < 5; i++) {
    if (f32(i) >= u.doors) { break; }
    let dx = abs(p.x - (0.5 + (f32(i) - (u.doors - 1.0) * 0.5) * 0.075));
    let arch = max(dx * aspect - 0.045, max(0.61 - p.y, p.y - 0.88));
    color += vec3f(0.85, 0.46, 0.16) * exp(-max(arch, 0.0) * 70.0) * 0.65;
  }
  for (var i = 0; i < 4; i++) {
    if (f32(i) >= max(1.0, u.company)) { break; }
    let lx = 0.3 + f32(i) * 0.17;
    let beam = exp(-pow((p.x - lx) * aspect / max(0.08, p.y * 0.3), 2.0));
    color += vec3f(0.7, 0.45, 0.2) * beam * (0.1 + 0.025 * sin(u.time * 0.7 + f32(i))) * p.y;
  }
  let edge = min(p.x, 1.0 - p.x);
  let curtainEdge = 0.03 + 0.035 * pow(p.y, 2.0) + u.curtain * 0.18;
  let velvet = vec3f(0.22, 0.045, 0.055) * (0.55 + 0.3 * cos(p.x * 280.0) + 0.1 * cos(p.x * 560.0));
  color = mix(color, velvet, 1.0 - smoothstep(curtainEdge, curtainEdge + 0.006, edge));
  color = mix(color, velvet, 1.0 - smoothstep(0.015, 0.035 + 0.017 * cos(p.x * 28.0), p.y));
  color *= 0.76 + 0.24 * pow(max(0.0, 1.0 - abs(p.x - 0.5)), 0.5);
  color += hash21(pixel) * 0.012;
  return vec4f(color, 1);
}
