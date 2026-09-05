#include "hash"
#include "noise"

// Compute-driven particle field. Particles live in CSS-pixel space of the
// target; the emitter is a rectangle. `mode` selects the look: 0 = snow
// (soft flakes, drift), 1 = embers (hot points rising, flicker), 2 = motes
// (slow dust). Everything the CPU needs to set is in ParticleParams.
struct ParticleParams {
  viewport: vec2f,
  time: f32,
  dt: f32,
  gravity: vec2f,
  wind: vec2f,
  emitter: vec4f,      // x, y, w, h
  color: vec4f,
  size: f32,
  life: f32,
  turbulence: f32,
  mode: f32,
  density: f32,        // 0..1 share of the pool allowed to be alive
  drag: f32,
  seed: f32,
  _pad: f32,
};

struct Particle {
  pos: vec2f,
  vel: vec2f,
  age: f32,
  life: f32,
  seed: f32,
  size: f32,
};

@group(0) @binding(0) var<uniform> p: ParticleParams;
@group(0) @binding(1) var<storage, read_write> particles: array<Particle>;

fn spawn(index: u32, particle: ptr<function, Particle>) {
  let h = hash22(vec2f(f32(index) * 0.731 + p.seed, p.time * 13.7));
  let h2 = hash22(vec2f(f32(index) * 1.913 - p.seed, p.time * 7.3 + 5.0));
  (*particle).pos = p.emitter.xy + h * p.emitter.zw;
  (*particle).vel = vec2f((h2.x - 0.5) * 20.0, (h2.y - 0.5) * 20.0);
  (*particle).age = 0.0;
  (*particle).life = p.life * (0.6 + 0.8 * h2.x);
  (*particle).seed = h.x * 1000.0;
  (*particle).size = p.size * (0.5 + h2.y);
}

@compute @workgroup_size(256)
fn update(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  if (index >= arrayLength(&particles)) { return; }
  var particle = particles[index];
  let allowed = f32(index) / f32(arrayLength(&particles)) < p.density;
  if (!allowed) {
    particle.age = particle.life + 1.0;
    particle.pos = vec2f(-1000.0, -1000.0);
    particles[index] = particle;
    return;
  }
  particle.age += p.dt;
  if (particle.age >= particle.life || particle.life <= 0.0) {
    spawn(index, &particle);
    if (p.time < 0.5) {
      // Fill the field on the first frames instead of raining in from the emitter edge.
      particle.age = particle.life * hash11(f32(index) * 3.3 + p.seed);
      particle.pos = vec2f(hash11(f32(index) * 1.1 + p.seed) * p.viewport.x, hash11(f32(index) * 2.7 + p.seed) * p.viewport.y);
    }
  }
  let t = p.time * 0.35 + particle.seed;
  let swirl = vec2f(
    noise2(particle.pos * 0.004 + vec2f(t, 0.0)) - 0.5,
    noise2(particle.pos * 0.004 + vec2f(0.0, t)) - 0.5,
  ) * p.turbulence;
  particle.vel += (p.gravity + p.wind + swirl) * p.dt;
  particle.vel *= max(0.0, 1.0 - p.drag * p.dt);
  particle.pos += particle.vel * p.dt;
  // Wrap horizontally so wind never empties the field; recycle vertically.
  if (particle.pos.x < -20.0) { particle.pos.x += p.viewport.x + 40.0; }
  if (particle.pos.x > p.viewport.x + 20.0) { particle.pos.x -= p.viewport.x + 40.0; }
  if (particle.pos.y > p.viewport.y + 30.0 || particle.pos.y < -60.0) { particle.age = particle.life + 1.0; }
  particles[index] = particle;
}

struct ParticleVertex {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) fade: f32,
  @location(2) seed: f32,
};

var<private> QUAD: array<vec2f, 6> = array<vec2f, 6>(
  vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
  vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
);

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> ParticleVertex {
  let particle = particles[instanceIndex];
  let corner = QUAD[vertexIndex % 6u];
  let lifeT = clamp(particle.age / max(particle.life, 0.001), 0.0, 1.0);
  let fade = sin(lifeT * 3.14159);
  let px = particle.pos + corner * particle.size;
  var ndc = (px / p.viewport) * 2.0 - vec2f(1.0);
  ndc.y = -ndc.y;
  var out: ParticleVertex;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.local = corner;
  out.fade = select(fade, 0.0, particle.age > particle.life);
  out.seed = particle.seed;
  return out;
}

@fragment
fn fs(in: ParticleVertex) -> @location(0) vec4f {
  let r = length(in.local);
  if (r > 1.0) { discard; }
  var alpha = 0.0;
  var rgb = p.color.rgb;
  if (p.mode < 0.5) {
    // Snow: soft disc with a slightly brighter core.
    alpha = smoothstep(1.0, 0.2, r) * (0.55 + 0.45 * smoothstep(0.6, 0.0, r));
  } else if (p.mode < 1.5) {
    // Embers: hot core, flicker with time, cooling toward orange-red at the edge.
    let flicker = 0.7 + 0.3 * sin(p.time * 17.0 + in.seed);
    alpha = pow(smoothstep(1.0, 0.0, r), 1.6) * flicker;
    rgb = mix(vec3f(1.0, 0.35, 0.05), vec3f(1.0, 0.9, 0.5), smoothstep(0.7, 0.0, r));
  } else {
    // Motes: faint, sharp.
    alpha = smoothstep(0.9, 0.3, r) * 0.6;
  }
  return vec4f(rgb, alpha * in.fade * p.color.a);
}
