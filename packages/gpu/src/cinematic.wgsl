#include "noise"
struct Cinema { screen: vec4f, beat: vec4f, pointer: vec4f, scene: vec4f };
@group(0) @binding(0) var<uniform> u: Cinema;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var current: texture_2d<f32>;
@group(0) @binding(3) var bloom: texture_2d<f32>;
@group(0) @binding(4) var history: texture_2d<f32>;
@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let energy = u.screen.w;
  let center = vec2f(0.58,0.4);
  let delta = uv-center;
  let r = length(delta * vec2f(u.screen.x/u.screen.y,1));
  let shock = sin(r*30.0-u.screen.z*4.0)*exp(-r*3.0)*u.beat.y;
  let shake = vec2f(sin(u.screen.z*33.0),cos(u.screen.z*27.0))*u.beat.y*0.004*energy;
  let q = clamp(uv+delta*shock*0.025+shake,vec2f(0.001),vec2f(0.999));
  let fringe = delta*(0.0008+u.beat.y*0.019+u.beat.z*0.008)*energy;
  var c = textureSampleLevel(current,s,q,0).rgb;
  c.r = textureSampleLevel(current,s,q+fringe,0).r;
  c.b = textureSampleLevel(current,s,q-fringe,0).b;
  c += textureSampleLevel(bloom,s,q,0).rgb * mix(0.25,0.95,energy);
  if (energy > 0.5) {
    let spokes = pow(max(0.0,noise2(vec2f(atan2(delta.y,delta.x)*80.0, floor(u.screen.z*3.0)))),9.0);
    c += vec3f(0.4,0.7,1.5)*spokes*pow(r,1.6)*(u.beat.y+u.beat.z*0.8);
    c = vec3f(1)-exp(-c*1.1);
    c += vec3f(0.18,0.015,0.05)*u.pointer.z*pow(clamp(r,0,1),2.0);
  } else {
    c = clamp(c,vec3f(0),vec3f(1));
    c -= vec3f(hash21(uv*u.screen.xy)*0.014);
  }
  let t = u.beat.x;
  if (t < 1.0) {
    let grain = fbm2(uv*vec2f(6,4)+u.scene.x,4);
    let mask = select(uv.x*0.4+grain*0.6,fract(uv.y*12.0+floor(uv.x*16.0)*0.13)*0.22+uv.x*0.78,energy>0.5);
    let blend = smoothstep(mask-0.11,mask+0.11,t*1.4-0.2);
    let shift = select(vec2f(sin(uv.y*9.0),cos(uv.x*8.0))*0.015,delta*0.24,energy>0.5)*(1.0-t);
    let old = textureSampleLevel(history,s,clamp(uv+shift,vec2f(0),vec2f(1)),0).rgb;
    c = mix(old,c,blend);
    let edge = exp(-abs(mask-(t*1.4-0.2))*65.0)*sin(t*3.14159);
    c += select(vec3f(0.16,0.06,-0.03),vec3f(0.45,0.95,0.3),energy>0.5)*edge;
  }
  let vignette = 1.0-smoothstep(0.25,1.2,r);
  c *= mix(1.0,0.72+vignette*0.28,energy);
  let headline=(1.0-smoothstep(0.44,0.62,uv.x))*(1.0-smoothstep(0.18,0.30,uv.y));
  c*=1.0-headline*0.82*energy;
  return vec4f(c,1);
}
