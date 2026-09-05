import { describe,expect,it } from "vitest";
import { createMockClient, type DiceRoll, type Scene } from "@hui/core";
import { Drama,rollEquation } from "../src/drama.ts";
const roll:DiceRoll={sides:6,value:2,modifier:-3,total:1,target:null,role:"enemy",outcome:"hit",label:"Counterattack",detail:"actual narration"};
const scene=()=>createMockClient().scene();
const rolled=(before:Scene):Scene=>({...before,presentation:{sequence:1,actionId:"attack",label:"Attack",kind:"engage",narrations:[roll.detail],rolls:[roll],damageTaken:1}});

describe("presentation clock",()=>{
  it("stages a roll, reveals it, and never repeats its impact after expiry",()=>{
    const initial=scene(),drama=new Drama(initial); drama.update(rolled(initial),10);
    expect(drama.sample(10.5).revealed).toBe(false);
    expect(drama.sample(11.55).impact).toBeCloseTo(1);
    expect(drama.sample(11.55).rolls).toEqual([roll]);
    expect(drama.sample(13.6).revealed).toBe(true);
    for(const time of [14,15,18.35,25.15]) { expect(drama.sample(time).rolls).toEqual([]); expect(drama.sample(time).impact).toBe(0); }
  });
  it("deduplicates events and replays presentation without changing the scene",()=>{
    const initial=scene(),drama=new Drama(initial),next=rolled(initial);
    expect(drama.update(next,1)).toBe(true); expect(drama.update(next,2)).toBe(false);
    drama.replay(10); expect(drama.scene).toBe(next); expect(drama.sample(10.1).rolls).toEqual([roll]);
    drama.skip(11); expect(drama.sample(11).active).toBe(false);
  });
  it("shows results immediately under reduced motion with no shake or travel",()=>{
    const initial=scene(),drama=new Drama(initial); drama.update(rolled(initial),0);
    const frame=drama.sample(0,true);
    expect(frame.revealed).toBe(true); expect(frame.rollingAge).toBe(2); expect(frame.impact).toBe(0); expect(frame.transition).toBe(1);
  });
  it("evolves with new places and celebrates completion",()=>{
    const initial=scene(),drama=new Drama(initial);
    drama.update({...initial,place:{...initial.place,id:"new-place"}},1);
    expect(drama.sample(1.5).beat).toBe("travel"); expect(drama.sample(1.5).progress).toBeGreaterThan(0);
    drama.update({...drama.scene,goal:{text:"Done",guidance:null,status:"completed"}},2);
    expect(drama.sample(2.7).beat).toBe("victory"); expect(drama.sample(2.7).progress).toBe(1);
  });
  it("discloses a minimum damage floor and skill-check difficulty",()=>{
    expect(rollEquation(roll)).toBe("2 − 3 → 1 DAMAGE (MIN 1)");
    expect(rollEquation({...roll,sides:20,value:14,modifier:2,total:16,target:12})).toBe("14 + 2 = 16  /  DC 12");
  });
});
