import { FullscreenPass, preprocessWgsl, WGSL_LIBS } from "@hui/gpu";
import { createShowpiece, type UiContext, type UiInstance } from "@hui/shell";
import { Pigment } from "./pigment.ts";
import shader from "./wgsl/painting.wgsl?raw";

export async function render(ctx: UiContext): Promise<UiInstance> {
  const pigment=new Pigment(ctx.gpu);
  const painting=new FullscreenPass(ctx.gpu,{ code:preprocessWgsl(shader,WGSL_LIBS),uniformBytes:64,textures:1,format:"rgba16float",label:"living pigment painting" });
  let lastSeed=-1;
  return createShowpiece(ctx,false,{
    update(encoder,params,reduced) {
      if(!reduced || lastSeed!==params[4]) pigment.update(encoder,params);
      lastSeed=params[4]!;
      painting.uniforms.set(0,params).upload(); painting.bind([pigment.view()]);
    },
    draw(pass) { painting.draw(pass); },
    destroy() { pigment.destroy(); painting.uniforms.buffer.destroy(); },
  });
}
