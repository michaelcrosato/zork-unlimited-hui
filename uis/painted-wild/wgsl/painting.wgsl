#include "noise"
struct Painting { screen: vec4f, scene: vec4f, beat: vec4f, pointer: vec4f };
@group(0) @binding(0) var<uniform> u: Painting;
@group(0) @binding(1) var s: sampler;
@group(0) @binding(2) var pigment: texture_2d<f32>;
@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pixel=uv*u.screen.xy;
  let p=(pixel-select(vec2f(0.61,0.38),vec2f(0.62,0.27),u.screen.x<760.0)*u.screen.xy)/u.screen.y;
  let a=atan2(p.y,p.x); let r=length(p);
  let paper=vec3f(0.94,0.895,0.80);
  let grain=hash21(pixel)*0.018+noise2(pixel*0.17)*0.018;
  var c=paper-vec3f(grain);
  let cloud=fbm2(p*4.5+u.scene.x,5);
  let bruise=exp(-r*r*4.0)*smoothstep(0.25,0.75,cloud);
  let blue=vec3f(0.06,0.16,0.35); let pink=vec3f(0.76,0.2,0.13);
  c=mix(c,mix(blue,pink,smoothstep(-0.4,0.5,p.x+sin(u.scene.x)*0.2)),bruise*0.75);
  let wash=textureSampleLevel(pigment,s,p*0.85+0.5,0);
  c=mix(c,mix(blue,pink,wash.r),clamp(wash.a*0.88,0.0,0.9));
  let veins=pow(1.0-abs(sin((cloud+wash.g*0.3)*34.0+r*14.0)),15.0);
  c+=vec3f(0.86,0.5,0.08)*veins*bruise*(0.3+u.scene.z*0.65);
  // A gilded sun and broken orbit, offset from the flowing floral structure.
  let sun=length(p-vec2f(0.23,-0.19));
  let sunMask=1.0-smoothstep(0.075,0.078,sun);
  c=mix(c,vec3f(1.35,0.88,0.25)*(0.85+grain*4.0),sunMask);
  let orbit=abs(length(p*vec2f(1.0,1.12))-0.39);
  c+=vec3f(0.48,0.31,0.09)*(1.0-smoothstep(0.0008,0.002,orbit))*step(-0.3,sin(a*3.0+u.scene.x));
  // Hand-cut reading islands. Their irregular edges are part of the artwork.
  let left=smoothstep(0.53,0.56,uv.y+noise2(uv*30.0)*0.008)*(1.0-smoothstep(0.455,0.47,uv.x));
  let right=smoothstep(0.69,0.71,uv.x+noise2(uv*35.0)*0.006)*smoothstep(0.365,0.38,uv.y);
  c=mix(c,paper+vec3f(0.035)-grain,max(left,right)*0.96);
  if(u.screen.x<760.0) { c=mix(c,paper+vec3f(0.035)-grain,(1.0-smoothstep(0.20,0.30,uv.y))*0.98); }
  return vec4f(c,1);
}
