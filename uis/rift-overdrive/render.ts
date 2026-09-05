import { FullscreenPass, preprocessWgsl, WGSL_LIBS } from "@hui/gpu";
import { createShowpiece, type UiContext, type UiInstance } from "@hui/shell";
import shader from "./wgsl/rift.wgsl?raw";

export async function render(ctx: UiContext): Promise<UiInstance> {
  const portal=new FullscreenPass(ctx.gpu,{code:preprocessWgsl(shader,WGSL_LIBS),uniformBytes:64,format:"rgba16float",label:"ray-marched rift architecture"});
  return createShowpiece(ctx,true,{
    update(_encoder,params) { portal.uniforms.set(0,params).upload(); },
    draw(pass) { portal.draw(pass); },
    destroy() { portal.uniforms.buffer.destroy(); },
  });
}
