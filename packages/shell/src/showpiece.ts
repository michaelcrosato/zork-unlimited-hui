import { CinematicPipeline, DiceRenderer, ShapeRenderer, VectorField, layoutText, type DiePose } from "@hui/gpu";
import type { UiContext, UiInstance } from "./boot.ts";
import { createSurface, type SurfacePalette } from "./surface.ts";
import { captionPanel, scenePanel, type SurfacePanel } from "./surface-model.ts";
import { Drama, rollEquation } from "./drama.ts";
import { showpieceLayout } from "./showpiece-layout.ts";

export interface ShowpieceArtwork {
  update(encoder: GPUCommandEncoder, params: number[], reduced: boolean): void;
  draw(pass: GPURenderPassEncoder): void;
  destroy(): void;
}

const paint: SurfacePalette = {
  body: [0.12,0.16,0.19,1], muted: [0.32,0.34,0.34,1], title: [0.075,0.13,0.18,1], accent: [0.62,0.20,0.09,1], danger: [0.72,0.09,0.10,1],
  panel: [0.95,0.92,0.84,0.97], card: [0.96,0.94,0.88,0.80], line: [0.34,0.32,0.25,0.26],
};
const neon: SurfacePalette = {
  body: [0.87,0.91,0.96,1], muted: [0.53,0.62,0.72,1], title: [0.93,0.96,1,1], accent: [0.77,0.99,0.23,1], danger: [1.0,0.23,0.43,1],
  panel: [0.009,0.011,0.023,0.96], card: [0.013,0.02,0.032,0.92], line: [0.42,0.56,0.26,0.38],
};

/** The artwork is interface-owned. This stage supplies complete game text and honest roll reveals. */
export function createShowpiece(ctx: UiContext, energy: boolean, artwork: ShowpieceArtwork): UiInstance {
  const { gpu } = ctx;
  const surface = createSurface(ctx, energy ? neon : paint, energy ? '"Segoe UI", sans-serif' : "Georgia, serif",
    { displayFamily: energy ? 'Impact, "Arial Narrow", sans-serif' : "Georgia, serif", atlasPx: 64, displayPx: 128 });
  const cinema = new CinematicPipeline(gpu);
  const field = new VectorField(gpu,energy);
  const dice = new DiceRenderer(gpu,energy);
  const stageMarks = new ShapeRenderer(gpu,"rgba16float");
  const drama = new Drama(ctx.client.scene());
  let time=0, width=0, height=0;
  let pointer:[number,number]=[-1,-1];
  let frame=drama.sample(0);
  let layout=showpieceLayout(1600,1000,energy,false,false);
  let compositionKey="";
  let basePanels: SurfacePanel[]=[];
  let needsCompose=true;
  ctx.root.dataset.showpiece=energy ? "energy" : "paint";

  const controls=document.createElement("div"); controls.className="hui-stage-controls";
  const replay=document.createElement("button"); replay.textContent="Replay dice"; replay.disabled=true;
  replay.title="Replay the last real result without taking another turn";
  const skip=document.createElement("button"); skip.textContent="Skip motion";
  replay.onclick=()=>{ drama.replay(time); cinema.transition(); compositionKey=""; };
  skip.onclick=()=>{ drama.skip(time); compositionKey=""; };
  controls.append(replay,skip); ctx.root.append(controls);

  const trimStoryHeading=(panel: SurfacePanel): SurfacePanel=>{
    const offset=(panel.blocks[3]?.y ?? 26)-14;
    panel.blocks=panel.blocks.slice(3).map(b=>({...b,y:b.y-offset}));
    panel.cards=panel.cards.map(c=>({...c,y:c.y-offset}));
    panel.contentHeight-=offset;
    return panel;
  };
  const compose=(reset:boolean):void=>{
    const scene=drama.scene;
    ({cssWidth:width,cssHeight:height}=gpu.size());
    layout=showpieceLayout(width,height,energy,frame.rolls.length>0,frame.combat);
    const {mobile,margin,hero,story,actions,footer}=layout;
    const m=surface.measures;
    const cap=(id:string,text:string,x:number,y:number,w:number,h:number,size:number,tone:"title"|"accent"|"muted"|"danger"="accent",ink:"display"|"italic"="italic")=>captionPanel(id,{x,y,width:w,height:h},text,m,size,tone,ink);
    const title=energy ? scene.place.name.toUpperCase() : scene.place.name;
    let titleSize=mobile ? frame.rolls.length ? 30 : energy ? 49 : 43 : Math.min(energy ? 106 : 77,width*(energy ? 0.067 : 0.050));
    // Fit authored long names into the poster without truncating them.
    while(titleSize>27 && layoutText(title,{maxWidth:hero.width,size:titleSize,lineHeight:titleSize*1.14,measure:m.display}).height>hero.height-24) titleSize-=2;
    const titlePanel=cap("place",title,hero.x,hero.y,hero.width,hero.height,titleSize,"title","display");
    titlePanel.blocks[0]!.layout=layoutText(title,{maxWidth:hero.width,size:titleSize,lineHeight:titleSize*1.14,measure:m.display});
    const readingMeasures=energy?{...m,display:m.body}:m;
    const storyPanel=trimStoryHeading(scenePanel(scene,"story",story,readingMeasures,mobile ? ["story","actions","log"] : ["story","log"]));
    if(energy) for(const b of storyPanel.blocks) if(b.ink==="display") b.ink="body";
    storyPanel.unframed=!mobile;
    basePanels=[
      cap("edition",energy ? "RIFT / OVERDRIVE" : "THE PAINTED WILD",margin,mobile?76:71,mobile?width-32:width*0.53,24,mobile?12:14),
      titlePanel,storyPanel,
      cap("chapter",`${scene.place.kicker || scene.place.context || scene.phase.replaceAll("_"," ")} · DAY ${scene.vitals.day} / ${scene.vitals.time}`.toUpperCase(),margin,mobile?frame.rolls.length?156:244:hero.y+Math.min(hero.height-25,titlePanel.blocks[0]!.layout.height+18),mobile?width-32:hero.width,40,mobile?9:11,"muted"),
    ];
    if (!mobile) {
      const moves=scenePanel(scene,"actions",actions,readingMeasures,["actions"]); moves.unframed=true;
      if(energy) for(const b of moves.blocks) if(b.ink==="display") b.ink="body";
      const block=moves.blocks[1]!; block.text=energy ? frame.combat ? "HIT. SURVIVE." : "MAKE YOUR MOVE." : "Make your mark.";
      block.ink="display";
      const headingWidth=Array.from(block.text).reduce((sum,ch)=>sum+m.display(ch,block.size),0);
      block.size=Math.min(block.size,block.size*block.width/Math.max(1,headingWidth));
      block.layout=layoutText(block.text,{maxWidth:block.width,size:block.size,lineHeight:block.size*1.5,measure:m.display});
      basePanels.push(moves);
      basePanels.push(cap("instrument-label",energy ? frame.combat ? "THREAT CONTACT / WEAPONS LIVE" : "THE RIFT IS LISTENING" : `STUDY ${String(Math.round(frame.progress*100)+1).padStart(2,"0")} / A WORLD IN THE MAKING`,width*0.44,height*0.75,width*0.28,50,11));
      basePanels.push(cap("vitals",`HP ${scene.vitals.hp}${scene.vitals.hpMax===null?"":` / ${scene.vitals.hpMax}`}     SUPPLIES ${scene.vitals.supplies}     ${scene.goal.status==="completed"?"CHAPTER COMPLETE":`DAY ${scene.vitals.day}`}`,footer.x,footer.y,footer.width,footer.height,12,scene.vitals.hp<8?"danger":"accent"));
    }
    needsCompose=false;
    updateOverlay(reset);
  };

  const poses=():DiePose[]=>frame.rolls.map((roll,i)=>({ sides:roll.sides,value:roll.value,
    x:layout.diceX+(frame.rolls.length===1?0:(i===0?-layout.spread:layout.spread)),y:layout.diceY,size:layout.diceSize,
    age:frame.rollingAge,enemy:roll.role==="enemy" }));

  const updateOverlay=(reset:boolean):void=>{
    const panels=[...basePanels];
    const m=surface.measures;
    const diePoses=poses();
    frame.rolls.forEach((roll,i)=>{
      const p=diePoses[i]!;
      const w=layout.mobile?width*0.47:Math.min(240,width*0.155);
      const x=p.x-w/2;
      const label=roll.role==="enemy"?"COUNTERATTACK":roll.role==="check"?roll.label.toUpperCase():"YOUR STRIKE";
      panels.push(captionPanel(`roll-label-${i}`,{x,y:p.y-p.size-43,width:w,height:36},`D${roll.sides} / ${label}`,m,layout.mobile?9:11,roll.role==="enemy"?"danger":"accent"));
      const outcome=frame.revealed ? roll.sides===20?roll.outcome.toUpperCase():`${roll.total} DAMAGE` : energy?"RESOLVING":"Fate, in motion.";
      panels.push(captionPanel(`roll-outcome-${i}`,{x,y:p.y+p.size+13,width:w,height:45},outcome,m,layout.mobile?23:energy?33:27,roll.role==="enemy"||roll.outcome==="failure"?"danger":"title","display"));
      panels.push(captionPanel(`roll-math-${i}`,{x,y:p.y+p.size+57,width:w,height:46},frame.revealed?rollEquation(roll):`Rolling a real d${roll.sides}…`,m,layout.mobile?10:12,"accent"));
    });
    if (!frame.rolls.length && frame.active && ["victory","death","damage"].includes(frame.beat)) {
      const text=frame.beat==="victory"?(energy?"LIMITS / BROKEN":"The world remembers."):frame.beat==="death"?(energy?"SIGNAL / LOST":"The last light."):`−${drama.scene.presentation?.damageTaken ?? 0} HP`;
      const x=layout.mobile?20:width*0.43, y=layout.mobile?199:height*0.31;
      panels.push(captionPanel("impact-title",{x,y,width:layout.mobile?width-40:width*0.29,height:190},text,m,layout.mobile?31:energy?56:38,frame.beat==="victory"?"accent":"danger","display"));
    }
    surface.setPanels(panels,reset);
    replay.disabled=drama.lastRolls.length===0;
    skip.disabled=!frame.active;
  };

  ctx.hooks.presentation=()=>({ beat:frame.beat,age:frame.age,transition:frame.transition,impact:frame.impact,
    progress:frame.progress,seed:frame.seed,combat:frame.combat,revealed:frame.revealed,rolls:frame.rolls,particles:field.count,
    mode:energy?"energy":"paint",reducedMotion:surface.reducedMotion });

  return {
    onScene(scene) {
      if(drama.update(scene,time)) { cinema.transition(); needsCompose=true; compositionKey=""; }
    },
    frame(dt,now) {
      time=now; frame=drama.sample(time,surface.reducedMotion);
      const size=gpu.size();
      const key=`${frame.rolls.map(r=>r.role+r.value).join()}/${frame.revealed}/${frame.active}`;
      if(needsCompose || width!==size.cssWidth || height!==size.cssHeight || (layout.mobile && Boolean(frame.rolls.length)!==layout.rolling)) compose(needsCompose);
      else if(compositionKey!==key) updateOverlay(false);
      compositionKey=key;
      const ambient=surface.reducedMotion?0:time;
      const hovered=drama.scene.actions.find(a=>a.id===surface.hovered);
      const hover=hovered ? hovered.kind==="engage"?2:hovered.kind==="move"||hovered.kind==="travel"?1:0.5 :0;
      const params=[width,height,ambient,surface.reducedMotion?0:dt,frame.seed,drama.scene.danger,frame.progress,frame.combat?1:0,
        frame.transition,frame.impact,frame.travel,frame.victory,...pointer,hover,energy?1:0];
      const encoder=gpu.device.createCommandEncoder();
      artwork.update(encoder,params,surface.reducedMotion); field.update(encoder,params);
      const art=cinema.beginArtwork(encoder); artwork.draw(art); field.draw(art); art.end();
      const pass=cinema.beginScene(encoder);
      stageMarks.begin();
      if(frame.rolls.length) for(const p of poses()) {
        const plateWidth=layout.mobile?width*0.47:Math.min(240,width*0.155);
        const plate=energy?[0.004,0.006,0.016,0.98] as [number,number,number,number]:[0.96,0.935,0.86,0.96] as [number,number,number,number];
        stageMarks.rect(p.x-plateWidth/2-7,p.y-p.size-48,plateWidth+14,30,plate,2);
        stageMarks.rect(p.x-plateWidth/2-7,p.y+p.size+9,plateWidth+14,88,plate,2);
        stageMarks.circle(p.x,p.y+12,p.size*1.36,energy?[0.004,0.006,0.02,0.91]:[0.96,0.935,0.86,0.94]);
        stageMarks.circle(p.x,p.y+12,p.size*(1.48+frame.impact*.20),energy?[0.6,1.5,0.15,0.45]:[0.55,0.31,0.09,0.4],1);
      }
      stageMarks.flush(pass); pass.end();
      if(frame.rolls.length) { const d=cinema.beginDice(encoder); dice.draw(d,poses()); d.end(); }
      const opticalTransition=["roll","damage","action"].includes(frame.beat)?1:frame.transition;
      cinema.finish(encoder,[width,height,ambient,energy?1:0,opticalTransition,frame.impact,frame.travel,frame.victory,
        ...pointer,drama.scene.ending?.death?1:0,frame.rolls.length?1:0,frame.seed,frame.progress,0,0]);
      // Typography follows the optical passes: readable text never inherits bloom,
      // chromatic separation or the old scene's interactive targets.
      const type=gpu.currentTexture().createView();
      const overlay=encoder.beginRenderPass({colorAttachments:[{view:type,loadOp:"load",storeOp:"store"}]});
      const title=basePanels.find(p=>p.id==="place");
      if(title) title.rect.x=layout.hero.x+(1-frame.transition)*(energy?72:-16);
      surface.draw(overlay,ambient,shapes=>{
        if(!layout.mobile) {
          const r=layout.story, a=layout.actions;
          // Soft reading islands have no stock panel border; their outer edges belong to the artwork.
          if(energy) {
            shapes.rect(r.x,r.y,r.width,r.height,[0.006,0.008,0.018,0.88]);
            shapes.rect(a.x,a.y,a.width,a.height,[0.006,0.008,0.018,0.90]);
          }
          const length=width*0.19;
          shapes.rect(width*0.44,height*0.80,length,2,energy?[0.2,0.3,0.15,0.5]:[0.5,0.4,0.2,0.25]);
          shapes.rect(width*0.44,height*0.80,length*Math.max(0.025,frame.progress),energy?5:2,surface.palette.accent);
          shapes.circle(width*0.44+length*frame.progress,height*0.80,energy?5:4,surface.palette.accent);
        }
      }); overlay.end();
      gpu.device.queue.submit([encoder.finish()]);
    },
    hit:surface.hit,
    hover(x,y) { pointer=[x/Math.max(width,1),y/Math.max(height,1)]; return surface.hover(x,y); },
    destroy() { controls.remove(); delete ctx.root.dataset.showpiece; delete ctx.hooks.presentation; surface.destroy(); cinema.destroy(); field.destroy(); dice.destroy(); stageMarks.destroy(); artwork.destroy(); },
  };
}
