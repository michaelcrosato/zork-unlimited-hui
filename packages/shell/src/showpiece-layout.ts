import type { Rect } from "./surface-model.ts";

/** Deliberately different poster compositions with a single scroll surface on phones. */
export function showpieceLayout(width: number, height: number, energy: boolean, rolling: boolean, combat: boolean) {
  const mobile = width < 760;
  const margin = mobile ? 16 : Math.max(28, width * 0.025);
  const hero: Rect = { x: margin, y: mobile ? 103 : 110, width: mobile ? width - margin * 2 : width * (energy ? 0.57 : 0.43), height: mobile ? 135 : height * 0.32 };
  const top = mobile ? rolling ? 460 : 300 : height * (energy ? combat ? 0.42 : 0.44 : 0.55);
  const story: Rect = { x: mobile ? 12 : margin - 16, y: top, width: mobile ? width - 24 : width * (energy ? 0.31 : 0.405), height: Math.max(100,height - top - (mobile ? 30 : 76)) };
  const actions: Rect = { x: width * (energy ? 0.735 : 0.735), y: height * (energy ? combat ? 0.36 : 0.43 : 0.40), width: width * 0.265 - margin, height: 0 };
  actions.height=Math.max(100,height-actions.y-76);
  const diceY = mobile ? 292 : height * (energy ? 0.43 : 0.32);
  const diceSize = mobile ? 61 : Math.min(94,width*0.062);
  const diceX = mobile ? width*0.5 : width*(energy ? 0.56 : 0.58);
  const spread = mobile ? width*0.24 : width*0.074;
  const footer: Rect = { x: margin, y: height-47, width: width-margin*2, height: 30 };
  return { mobile, rolling, margin, hero, story, actions, footer, diceY, diceSize, diceX, spread };
}
