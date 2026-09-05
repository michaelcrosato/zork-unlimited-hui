#include "cartographer/frame"

// Towns as instanced obelisks standing on the height field. Kind 0 is a
// discovered town, 1 a visited one, 2 the town the player stands in, which
// pulses and glows as the map's beacon.
struct PinInstance {
  @location(0) placement: vec4f, // x, z, scale, kind
  @location(1) colour: vec4f,
};

struct PinOut {
  @builtin(position) position: vec4f,
  @location(0) world: vec3f,
  @location(1) colour: vec4f,
  @location(2) kind: f32,
  @location(3) local: vec3f,
};

// A square obelisk: four side faces and a base, 18 vertices.
var<private> OBELISK: array<vec3f, 18> = array<vec3f, 18>(
  vec3f(-1.0, 0.0, -1.0), vec3f(1.0, 0.0, -1.0), vec3f(0.0, 1.0, 0.0),
  vec3f(1.0, 0.0, -1.0), vec3f(1.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0),
  vec3f(1.0, 0.0, 1.0), vec3f(-1.0, 0.0, 1.0), vec3f(0.0, 1.0, 0.0),
  vec3f(-1.0, 0.0, 1.0), vec3f(-1.0, 0.0, -1.0), vec3f(0.0, 1.0, 0.0),
  vec3f(-1.0, 0.0, -1.0), vec3f(-1.0, 0.0, 1.0), vec3f(1.0, 0.0, 1.0),
  vec3f(-1.0, 0.0, -1.0), vec3f(1.0, 0.0, 1.0), vec3f(1.0, 0.0, -1.0),
);

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, pin: PinInstance) -> PinOut {
  let local = OBELISK[vertexIndex % 18u];
  let pulse = select(1.0, 1.0 + 0.12 * sin(frame.cameraPos.w * 4.0), pin.placement.w > 1.5);
  let scale = pin.placement.z * pulse;
  let uv = worldToUv(pin.placement.xy);
  let base = heightAt(uv);
  let world = vec3f(pin.placement.x + local.x * scale * 0.55, base + local.y * scale * 2.6, pin.placement.y + local.z * scale * 0.55);
  var out: PinOut;
  out.position = frame.viewProj * vec4f(world, 1.0);
  out.world = world;
  out.colour = pin.colour;
  out.kind = pin.placement.w;
  out.local = local;
  return out;
}

@fragment
fn fs(in: PinOut) -> @location(0) vec4f {
  let normal = normalize(cross(dpdx(in.world), dpdy(in.world)));
  let sun = frame.sunDir.xyz;
  let dayLight = clamp(frame.sunDir.w * 1.6 + 0.15, 0.0, 1.0);
  let diffuse = max(dot(normal, sun), 0.0) * dayLight;
  let ambient = mix(0.4, 0.15, frame.params.y);
  var colour = in.colour.rgb * (ambient + diffuse);
  // Towns keep a lantern lit at night; the current town always glows.
  let lantern = mix(frame.params.y * 0.6, 1.0, step(1.5, in.kind));
  let glow = in.colour.rgb * lantern * (0.6 + 0.4 * in.local.y);
  colour += glow * select(0.35, 1.2 + 0.4 * sin(frame.cameraPos.w * 4.0), in.kind > 1.5);
  return vec4f(colour, 1.0);
}
