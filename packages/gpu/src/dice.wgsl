struct Dice { screen: vec4f, pose: vec4f, rotation: vec4f, event: vec4f };
@group(0) @binding(0) var<uniform> u: Dice;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var numerals: texture_2d<f32>;
fn rotate(q: vec4f, v: vec3f) -> vec3f { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
struct Out { @builtin(position) position: vec4f, @location(0) normal: vec3f, @location(1) uv: vec2f, @location(2) face: f32, @location(3) bary: vec3f, @location(4) point: vec3f };
@vertex
fn vs(@location(0) position: vec3f, @location(1) normal: vec3f, @location(2) uv: vec2f, @location(3) face: f32, @location(4) bary: vec3f) -> Out {
  let p = rotate(u.rotation, position);
  let pixel = u.pose.xy + vec2f(p.x, -p.y) * u.pose.z / (1.0 - p.z * 0.15);
  var o: Out;
  o.position = vec4f(pixel.x / u.screen.x * 2.0 - 1.0, 1.0 - pixel.y / u.screen.y * 2.0, 0.5 - p.z * 0.15, 1);
  o.normal = rotate(u.rotation, normal); o.uv = uv; o.face = face; o.bary = bary; o.point = p;
  return o;
}
@fragment
fn fs(o: Out) -> @location(0) vec4f {
  let cell = vec2f(vec2u((u32(o.face) - 1u) % 5u, (u32(o.face) - 1u) / 5u));
  let uv = clamp(o.uv, vec2f(0.006), vec2f(0.994));
  let ink = textureSample(numerals, texSampler, (cell + uv) / vec2f(5,4)).a;
  let inside = step(0.0, min(o.uv.x, o.uv.y)) * step(max(o.uv.x, o.uv.y), 1.0);
  let light = max(0.0, dot(o.normal, normalize(vec3f(-0.5,0.7,1.0))));
  let edgeDistance = select(min(min(o.uv.x, o.uv.y), min(1.0-o.uv.x,1.0-o.uv.y)), min(min(o.bary.x, o.bary.y), o.bary.z), u.screen.z > 6.0);
  let edge = 1.0 - smoothstep(0.014, 0.035, edgeDistance);
  let neon = select(vec3f(0.72,1.9,0.08), vec3f(2.5,0.1,0.48), u.pose.w > 0.5);
  var body = mix(vec3f(0.7,0.57,0.4), vec3f(1.25,1.13,0.86), light);
  var number = vec3f(0.095,0.13,0.2);
  if (u.screen.w > 0.5) {
    body = vec3f(0.018,0.025,0.06) * (0.7 + light * 3.0) + neon * edge * 0.95;
    number = neon * 1.4;
    body += neon * pow(max(0.0, dot(reflect(normalize(vec3f(0.5,-0.7,-1.0)), o.normal), vec3f(0,0,1))), 30.0) * 0.5;
  } else { body = mix(body, vec3f(0.75,0.4,0.08), edge * 0.45); }
  return vec4f(mix(body, number, ink * inside), 1);
}
