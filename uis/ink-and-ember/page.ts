import type { Scene } from "@hui/core";
import { layoutText, type TextLayout } from "@hui/gpu";

export type BlockKind =
  | "kicker"
  | "title"
  | "vitals"
  | "ending"
  | "prose"
  | "dialogue"
  | "result"
  | "pressure"
  | "choice"
  | "terms"
  | "note";

/** Which face a block is set in; each maps to one glyph atlas. */
export type Ink = "body" | "display" | "italic";

export interface PageBlock {
  kind: BlockKind;
  text: string;
  /** Terms, consequences and blocked reasons for a choice. */
  detail?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  size: number;
  lineHeight: number;
  ink: Ink;
  layout: TextLayout;
  actionId?: string;
  disabled?: boolean;
  /** Position in reading order; drives the staggered ink reveal. */
  order: number;
}

export interface PageModel {
  blocks: PageBlock[];
  height: number;
  column: { x: number; width: number };
}

export type Measure = (ch: string, size: number) => number;

const MAX_COLUMN = 760;
const TOP = 96;
const BOTTOM = 140;

/**
 * Lay the Scene out as one manuscript column. Pure: given the same scene,
 * viewport and measuring functions it always produces the same blocks, so
 * hit testing, tests and rendering all agree.
 */
export function composePage(
  scene: Scene,
  viewport: { width: number; height: number },
  measure: Measure,
  measures: Partial<Record<Ink, Measure>> = {},
): PageModel {
  const margin = Math.max(24, viewport.width * 0.06);
  const width = Math.max(120, Math.min(MAX_COLUMN, viewport.width - margin * 2));
  const x = (viewport.width - width) / 2;
  const scale = Math.min(1, width / 560);
  const blocks: PageBlock[] = [];
  let y = TOP;

  const add = (
    kind: BlockKind,
    text: string,
    size: number,
    ink: Ink,
    extra: Partial<Pick<PageBlock, "detail" | "actionId" | "disabled">> & { indent?: number; gapAfter?: number } = {},
  ): void => {
    if (text.length === 0) return;
    const indent = extra.indent ?? 0;
    const lineHeight = Math.round(size * (kind === "title" ? 1.05 : 1.55));
    const layout = layoutText(text, {
      maxWidth: width - indent,
      size,
      lineHeight,
      measure: measures[ink] ?? measure,
    });
    blocks.push({
      kind,
      text,
      x: x + indent,
      y,
      width: width - indent,
      height: layout.height,
      size,
      lineHeight,
      ink,
      layout,
      order: blocks.length,
      ...(extra.detail !== undefined ? { detail: extra.detail } : {}),
      ...(extra.actionId !== undefined ? { actionId: extra.actionId } : {}),
      ...(extra.disabled !== undefined ? { disabled: extra.disabled } : {}),
    });
    y += layout.height + (extra.gapAfter ?? 12);
  };

  add("kicker", (scene.place.kicker || scene.place.context || scene.phase).toUpperCase(), Math.round(12 * scale + 1), "display", {
    gapAfter: 6,
  });
  add("title", scene.place.name, Math.round(44 * scale), "display", { gapAfter: 10 });
  const v = scene.vitals;
  const vitals = [
    `Day ${v.day} · ${v.time}`,
    v.hpMax ? `HP ${v.hp}/${v.hpMax}` : `HP ${v.hp}`,
    v.suppliesMax ? `Supplies ${v.supplies}/${v.suppliesMax}` : `Supplies ${v.supplies}`,
    `Fatigue ${v.fatigue}`,
    v.condition ?? "",
  ]
    .filter(Boolean)
    .join("  ·  ");
  add("vitals", vitals, Math.round(11 * scale + 1), "display", { gapAfter: 26 });

  if (scene.ending) add("ending", scene.ending.title, Math.round(28 * scale), "display", { gapAfter: 14 });
  for (const paragraph of scene.prose) add("prose", paragraph, Math.round(19 * scale), "body", { gapAfter: 14 });
  if (scene.dialogue) {
    add("dialogue", `${scene.dialogue.speaker}: “${scene.dialogue.text}”`, Math.round(18 * scale), "italic", {
      indent: 24,
      gapAfter: 18,
    });
  }
  add("result", `¶ ${scene.result}`, Math.round(17 * scale), "italic", { gapAfter: 22 });
  for (const track of scene.pressure) {
    const description = track.description ? `: ${track.description}` : "";
    const next = track.next ? ` · ${track.next}` : "";
    add("pressure", `${track.title} — ${track.band} (${track.value})${description}${next}`, Math.round(13 * scale + 1), "display", {
      gapAfter: 6,
    });
  }
  if (scene.pressure.length > 0) y += 14;

  let number = 0;
  for (const action of scene.actions.filter((a) => a.primary)) {
    number += 1;
    const detail = [action.terms, action.consequence, action.disabledReason].filter(Boolean).join(" · ");
    add("choice", `${number} · ${action.label}`, Math.round(19 * scale), "display", {
      actionId: action.id,
      disabled: action.disabledReason !== undefined,
      ...(detail ? { detail } : {}),
      gapAfter: detail ? 4 : 12,
    });
    if (detail) add("terms", detail, Math.round(13 * scale + 1), "body", { indent: 28, gapAfter: 12 });
    if (action.detail) add("terms", action.detail, Math.round(13 * scale + 1), "italic", { indent: 28, gapAfter: 12 });
  }
  const secondary = scene.actions.filter((a) => !a.primary);
  if (secondary.length > 0) y += 8;
  for (const action of secondary) {
    add("note", `· ${action.label}${action.terms ? ` — ${action.terms}` : ""}`, Math.round(14 * scale), "body", {
      actionId: action.id,
      disabled: action.disabledReason !== undefined,
      gapAfter: 4,
    });
  }

  return { blocks, height: y + BOTTOM, column: { x, width } };
}

/** The clickable block under a point in page coordinates, if any. */
export function blockAt(page: PageModel, x: number, y: number): PageBlock | null {
  for (const block of page.blocks) {
    if (!block.actionId) continue;
    if (x >= block.x - 8 && x <= block.x + block.width && y >= block.y - 4 && y <= block.y + block.height + 4) return block;
  }
  return null;
}
