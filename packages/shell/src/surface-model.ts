import type { Scene } from "@hui/core";
import { layoutText, type TextLayout } from "@hui/gpu";
import type { Ink, Measure } from "./page.ts";

export interface Rect { x: number; y: number; width: number; height: number }
export type Tone = "body" | "muted" | "accent" | "title" | "danger";
export interface SurfaceBlock extends Rect {
  text: string; size: number; ink: Ink; tone: Tone; layout: TextLayout;
}
export interface ActionCard extends Rect { id: string; disabled: boolean }
export interface SurfacePanel {
  id: string; rect: Rect; blocks: SurfaceBlock[]; cards: ActionCard[]; contentHeight: number;
  scroll: number; chrome: boolean;
  /** Use a bespoke shader for the paper/frame while retaining scroll behaviour. */
  unframed?: boolean;
}
export type Measures = Record<Ink, Measure>;
export type Section = "story" | "actions" | "log";

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

export function clampScroll(panel: SurfacePanel, scroll: number): number {
  return Math.max(0, Math.min(Math.max(0, panel.contentHeight - panel.rect.height), scroll));
}

/** Keeps authored strings intact and primary action numbering in engine order. */
export function scenePanel(scene: Scene, id: string, rect: Rect, measures: Measures, sections: Section[]): SurfacePanel {
  const blocks: SurfaceBlock[] = [];
  const cards: ActionCard[] = [];
  const padding = rect.width < 350 ? 20 : 28;
  const width = Math.max(60, rect.width - padding * 2);
  let y = 26;
  const add = (text: string, size = 17, ink: Ink = "body", tone: Tone = "body", inset = 0, gap = 14): void => {
    if (!text) return;
    const layout = layoutText(text, { maxWidth: width - inset * 2, size, lineHeight: Math.ceil(size * 1.5), measure: measures[ink] });
    blocks.push({ text, size, ink, tone, layout, x: padding + inset, y, width: width - inset * 2, height: layout.height });
    y += layout.height + gap;
  };
  const label = (text: string): void => add(text, 11, "italic", "accent", 0, 12);
  for (const section of sections) {
    if (section === "story") {
      label((scene.place.kicker || scene.place.context || scene.phase.replaceAll("_", " ")).toUpperCase());
      add(scene.place.name, rect.width < 450 ? 30 : 38, "display", "title", 0, 20);
      add(`DAY ${scene.vitals.day}  /  ${scene.vitals.time}  /  ${scene.phase.replaceAll("_", " ").toUpperCase()}`, 11, "italic", "muted", 0, 24);
      for (const prose of scene.prose) add(prose);
      if (scene.dialogue) {
        label(scene.dialogue.speaker.toUpperCase());
        add(`“${scene.dialogue.text}”`, 18, "body", "title", 8, 22);
      }
      if (scene.result) { label("LATEST RESULT"); add(scene.result, 16, "body", "accent", 0, 24); }
      if (scene.ending) {
        label(scene.ending.death ? "JOURNEY LOST" : "CHAPTER COMPLETE");
        add(scene.ending.title, 28, "display", scene.ending.death ? "danger" : "title");
        add(scene.ending.text);
      }
    }
    if (section === "actions") {
      label("YOUR NEXT MOVE");
      add("Choose a path", 27, "display", "title", 0, 6);
      add("Click a card or use 1–9. Scroll for more.", 12, "italic", "muted", 0, 24);
      let number = 0;
      let group = "";
      for (const action of scene.actions) {
        if (action.group !== group) { group = action.group; label(group.toUpperCase()); }
        const top = y;
        y += 14;
        const prefix = action.primary ? `${++number}. ` : "↳ ";
        add(`${prefix}${action.label}`, 17, "display", action.disabledReason ? "muted" : "accent", 14, 8);
        for (const detail of [action.detail, action.terms, action.consequence, action.disabledReason]) {
          if (detail) add(detail, 13, "body", action.disabledReason ? "muted" : "body", 14, 8);
        }
        y += 6;
        cards.push({ id: action.id, disabled: action.disabledReason !== undefined, x: padding, y: top, width, height: y - top });
        y += 14;
      }
      if (!scene.actions.length) add("No actions are available in this scene.", 15, "body", "muted");
    }
    if (section === "log") {
      label("EXPEDITION RECORD");
      const v = scene.vitals;
      add(`Health  ${v.hp}${v.hpMax === null ? "" : ` / ${v.hpMax}`}\nSupplies  ${v.supplies}${v.suppliesMax === null ? "" : ` / ${v.suppliesMax}`}\nFatigue  ${v.fatigue}${v.money === null ? "" : `\nMoney  ${v.money}`}`, 14, "italic", "body");
      if (v.condition) add(v.condition, 14, "body", "accent");
      add(`Save: ${scene.saveStatus}`, 12, "italic", "muted");
      if (scene.goal.text) {
        label(`OBJECTIVE · ${scene.goal.status.toUpperCase()}`);
        add(scene.goal.text, 17, "display", "title");
        if (scene.goal.guidance) add(scene.goal.guidance, 14);
      }
      for (const track of scene.pressure) {
        label(`${track.title.toUpperCase()} · ${track.band} · ${track.value}`);
        if (track.description) add(track.description, 14);
        if (track.next) add(track.next, 13, "body", "accent");
      }
      label("JOURNAL · NEWEST FIRST");
      if (!scene.journal.length) add("Your journey is just beginning.", 14, "body", "muted");
      for (const entry of scene.journal) add(entry, 14);
    }
    y += 20;
  }
  return { id, rect, blocks, cards, contentHeight: y + 20, scroll: 0, chrome: true };
}

export function captionPanel(id: string, rect: Rect, text: string, measures: Measures, size = 14, tone: Tone = "accent", ink: Ink = "italic"): SurfacePanel {
  const layout = layoutText(text, { maxWidth: rect.width, size, lineHeight: size * 1.4, measure: measures[ink] });
  return { id, rect, blocks: [{ ...rect, x: 0, y: 0, text, layout, size, ink, tone }], cards: [], contentHeight: rect.height, scroll: 0, chrome: false };
}
