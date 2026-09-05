#include "noise"
struct Flow { screen: vec4f, scene: vec4f, beat: vec4f, pointer: vec4f };
@group(0) @binding(0) var<uniform> u: Flow;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var previous: texture_2d<f32>;
@group(0) @binding(3) var next: texture_storage_2d<rgba16float,write>;
@compute @workgroup_size(8,8)
fn paint(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy>=vec2u(512))) { return; }
  let uv=(vec2f(id.xy)+0.5)/512.0;
  let p=uv-0.5;
  let a=atan2(p.y,p.x); let r=length(p);
  let time=u.screen.z;
  let dt=clamp(u.screen.w*60.0,0.0,2.0);
  let velocity=vec2f(-p.y,p.x)*(0.009+u.beat.y*0.03)+vec2f(sin(p.y*14.0+time*0.07),cos(p.x*12.0-time*0.08))*0.002;
  let sourceUv=clamp(uv-velocity*dt,vec2f(0.001),vec2f(0.999));
  var pigment=textureSampleLevel(previous,s,sourceUv,0);
  let diffuse=(textureSampleLevel(previous,s,sourceUv+vec2f(0.002,0),0)+textureSampleLevel(previous,s,sourceUv-vec2f(0.002,0),0)
    +textureSampleLevel(previous,s,sourceUv+vec2f(0,0.002),0)+textureSampleLevel(previous,s,sourceUv-vec2f(0,0.002),0))*0.25;
  pigment=mix(pigment,diffuse,0.11)*pow(0.997,dt);
  let petal=0.21+sin(a*(4.0+floor(u.scene.z*6.0))+u.scene.x)*0.075+cos(a*3.0)*0.035;
  let line=exp(-abs(r-petal)*80.0);
  let pigmentColor=0.5+0.5*cos(vec3f(0,2.1,4.2)+a*2.0+u.scene.x);
  let feed=line*(0.014+u.beat.y*0.08+u.beat.w*0.04)*max(dt,0.1);
  // Whole-vector writes work without the experimental swizzle_assignment feature.
  pigment=vec4f(clamp(pigment.rgb+pigmentColor*feed,vec3f(0),vec3f(2)),clamp(pigment.a+feed,0.0,1.0));
  textureStore(next,vec2i(id.xy),pigment);
}
