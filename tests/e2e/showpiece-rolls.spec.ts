import { expect,test,type Page } from "./gpu-test.ts";
import type { Action } from "@hui/core";
import { engineLinked } from "../../scripts/engine-path.mjs";

test.use({video:{mode:"on",size:{width:1600,height:1000}}});
const slugs=["painted-wild","rift-overdrive"];
async function act(page:Page,predicate:(a:Action)=>boolean) {
  const choices=await page.evaluate(()=>window.__hui!.scene().actions);
  const action=choices.find(a=>!a.disabledReason && predicate(a));
  expect(action,choices.map(a=>`${a.id}: ${a.label}`).join(" | ")).toBeDefined();
  const { result, frame } = await page.evaluate(id => {
    const result = window.__hui!.act(id);
    return { result, frame: window.__hui!.frames };
  }, action!.id);
  expect(result.ok).toBe(true);
  // Wait for a rendered update; a short animation-age window can pass before polling starts.
  await page.waitForFunction(before => window.__hui!.frames > before, frame);
}
async function byre(page:Page,slug:string) {
  const errors:string[]=[];
  page.on("console",m=>{if(m.type()==="error") errors.push(m.text());});
  page.on("pageerror",e=>errors.push(String(e)));
  await page.goto(`/uis/${slug}/?client=live`);
  await page.waitForFunction(()=>window.__hui?.ready || window.__hui?.error);
  expect(await page.evaluate(()=>window.__hui!.error)).toBeNull();
  await act(page,a=>a.kind==="meta");
  await act(page,a=>a.kind==="talk" && /rowan quill/i.test(a.label));
  await act(page,a=>a.kind==="choice" && /road warden/i.test(a.label));
  for(let i=0;i<8 && await page.evaluate(()=>window.__hui!.scene().phase==="story_choice");i++) {
    const choice=await page.evaluate(()=>window.__hui!.scene().actions.some(a=>a.kind==="choice"&&!a.disabledReason));
    await act(page,a=>a.kind===(choice?"choice":"meta"));
  }
  await act(page,a=>a.kind==="move"&&/station quarter/i.test(a.label));
  await act(page,a=>a.group==="Dispatch"&&a.kind==="choice");
  await act(page,a=>a.kind==="use"||a.kind==="move");
  return errors;
}
for(const slug of slugs) {
  test(`${slug} stages real paired d6 rolls, impact, replay and save reload`,async({page})=>{
    test.skip(!engineLinked().linked,"Sibling engine is not linked");
    const errors=await byre(page,slug);
    const before=await page.evaluate(()=>window.__hui!.presentation!());
    await act(page,a=>a.id==="q:go_north");
    await page.waitForFunction(()=>window.__hui!.presentation!().age>0.45);
    const travel=await page.evaluate(()=>window.__hui!.presentation!());
    expect(travel.beat).toBe("travel"); expect(travel.transition).toBeLessThan(1); expect(travel.seed).not.toBe(before.seed);
    expect(travel.progress).toBeGreaterThan(before.progress);
    await page.screenshot({path:`test-results/screens/${slug}-travel-transition.png`});
    await page.waitForFunction(()=>window.__hui!.presentation!().age>2);
    await act(page,a=>a.kind==="engage");
    const scene=await page.evaluate(()=>window.__hui!.scene());
    expect(scene.presentation!.rolls.map(r=>r.role)).toEqual(["player","enemy"]);
    await page.waitForFunction(()=>window.__hui!.presentation!().age>0.35);
    const tumble=await page.screenshot({path:`test-results/screens/${slug}-dice-tumble.png`});
    expect(await page.evaluate(()=>window.__hui!.presentation!().revealed)).toBe(false);
    await page.waitForFunction(()=>window.__hui!.presentation!().age>1.5);
    expect(await page.evaluate(()=>window.__hui!.presentation!().impact)).toBeGreaterThan(0.5);
    const reveal=await page.screenshot({path:`test-results/screens/${slug}-dice-reveal.png`});
    expect(reveal.equals(tumble)).toBe(false);
    expect(await page.evaluate(()=>window.__hui!.presentation!().rolls)).toEqual(scene.presentation!.rolls);
    for(const roll of scene.presentation!.rolls) await expect(page.locator(".hui-a11y")).toContainText(roll.detail);
    await page.waitForFunction(()=>window.__hui!.presentation!().rolls.length===0);
    await page.getByRole("button",{name:"Replay dice",exact:true}).click();
    await page.waitForFunction(()=>window.__hui!.presentation!().rolls.length===2);
    expect(await page.evaluate(()=>window.__hui!.scene())).toEqual(scene);
    await page.waitForFunction(()=>window.__hui!.presentation!().age>1.7);
    await page.screenshot({path:`test-results/screens/${slug}-dice-settled.png`});
    await page.getByRole("button",{name:"Skip motion",exact:true}).click();
    await page.waitForFunction(()=>window.__hui!.presentation!().rolls.length===0);
    await page.reload(); await page.waitForFunction(()=>window.__hui?.ready);
    expect(await page.evaluate(()=>window.__hui!.scene().presentation)).toBeUndefined();
    await expect(page.getByRole("button",{name:"Replay dice",exact:true})).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test(`${slug} reveals a real d20 check and supports a motion-free replay`,async({page})=>{
    test.skip(!engineLinked().linked,"Sibling engine is not linked");
    const errors=await byre(page,slug);
    await act(page,a=>a.id==="q:talk_houndsman");
    await act(page,a=>/^Ask DRIVE /i.test(a.label));
    await act(page,a=>/^CHOOSE DRIVE/i.test(a.label));
    await act(page,a=>/^LEAVE /i.test(a.label));
    await act(page,a=>/^take .*signal-and-rope/i.test(a.label));
    await act(page,a=>a.id==="q:go_north");
    const check=await page.evaluate(()=>window.__hui!.scene().actions.find(a=>/\bfire drive shutter signal/i.test(a.label)));
    expect(check?.terms).toMatch(/12/);
    await act(page,a=>/\bfire drive shutter signal/i.test(a.label));
    const scene=await page.evaluate(()=>window.__hui!.scene());
    const roll=scene.presentation!.rolls[0]!;
    expect(roll.sides).toBe(20); expect(roll.target).toBe(12);
    expect(roll.total).toBe(roll.value+roll.modifier);
    await page.waitForFunction(()=>window.__hui!.presentation!().age>1.8);
    await page.screenshot({path:`test-results/screens/${slug}-d20-reveal.png`});
    expect((await page.evaluate(()=>window.__hui!.sample())).nonBlank).toBe(true);
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.getByRole("button",{name:"Replay dice",exact:true}).click();
    await page.waitForFunction(()=>window.__hui!.presentation!().reducedMotion);
    const frame=await page.evaluate(()=>window.__hui!.presentation!());
    expect(frame.revealed).toBe(true); expect(frame.impact).toBe(0); expect(frame.transition).toBe(1);
    expect(frame.rolls).toEqual([roll]);
    expect(await page.evaluate(()=>window.__hui!.scene().vitals)).toEqual(scene.vitals);
    await page.screenshot({path:`test-results/screens/${slug}-mobile-d20.png`});
    expect(errors).toEqual([]);
  });
}
