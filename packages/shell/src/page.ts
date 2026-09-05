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
  /** Position in reading order; drives staggered reveals. */
  order: number;
}

export interface PageModel {
  blocks: PageBlock[];
  height: number;
  column: { x: number; width: number };
}

export type Measure = (ch: string, size: number) => number;

export interface PageOptions {
  /** Place the column explicitly instead of centring it. */
  column?: { x: number; width: number };
  /** Distance from the top of the layout to the first block. */
  top?: number;
  /** Multiply every font size (a side panel wants smaller type). */
  typeScale?: number;
  /** Skip the vitals line (an interface may show vitals elsewhere). */
  vitals?: boolean;
  /** Skip the secondary-action notes. */
  notes?: boolean;
}

const MAX_COLUMN = 760;
const BOTTOM = 140;

/**
 * Lay a Scene out as one text column: kicker, title, vitals, prose, dialogue,
 * result, pressure, numbered choices with their terms, then secondary actions
 * as notes. Pure: the same inputs always produce the same blocks, so hit
 * testing, tests and rendering agree. Shared by every text-forward interface.
 */
export function composePage(
  scene: Scene,
  viewport: { width: number; height: number },
  measure: Measure,
  measures: Partial<Record<Ink, Measure>> = {},
  options: PageOptions = {},
): PageModel {
  const margin = Math.max(24, viewport.width * 0.06);
  const width = options.column?.width ?? Math.max(120, Math.min(MAX_COLUMN, viewport.width - margin * 2));
  const x = options.column?.x ?? (viewport.width - width) / 2;
  const scale = Math.min(1, width / 560) * (options.typeScale ?? 1);
  const blocks: PageBlock[] = [];
  let y = options.top ?? 96;
  const px = (size: number): number => Math.max(9, Math.round(size * scale));

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
    const layout = layoutText(text, { maxWidth: width - indent, size, lineHeight, measure: measures[ink] ?? measure });
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

  add("kicker", (scene.place.kicker || scene.place.context || scene.phase).toUpperCase(), px(12) + 1, "display", { gapAfter: 6 });
  add("title", scene.place.name, px(44), "display", { gapAfter: 10 });
  if (options.vitals !== false) {
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
    add("vitals", vitals, px(11) + 1, "display", { gapAfter: 26 });
  } else {
    y += 8;
  }

  if (scene.ending) add("ending", scene.ending.title, px(28), "display", { gapAfter: 14 });
  for (const paragraph of scene.prose) add("prose", paragraph, px(19), "body", { gapAfter: 14 });
  if (scene.dialogue) {
    add("dialogue", `${scene.dialogue.speaker}: “${scene.dialogue.text}”`, px(18), "italic", { indent: 24, gapAfter: 18 });
  }
  add("result", `¶ ${scene.result}`, px(17), "italic", { gapAfter: 22 });
  for (const track of scene.pressure) {
    const description = track.description ? `: ${track.description}` : "";
    const next = track.next ? ` · ${track.next}` : "";
    add("pressure", `${track.title} — ${track.band} (${track.value})${description}${next}`, px(13) + 1, "display", { gapAfter: 6 });
  }
  if (scene.pressure.length > 0) y += 14;

  let number = 0;
  for (const action of scene.actions.filter((a) => a.primary)) {
    number += 1;
    const detail = [action.terms, action.consequence, action.disabledReason].filter(Boolean).join(" · ");
    add("choice", `${number} · ${action.label}`, px(19), "display", {
      actionId: action.id,
      disabled: action.disabledReason !== undefined,
      ...(detail ? { detail } : {}),
      gapAfter: detail ? 4 : 12,
    });
    if (detail) add("terms", detail, px(13) + 1, "body", { indent: 28, gapAfter: 12 });
    if (action.detail) add("terms", action.detail, px(13) + 1, "italic", { indent: 28, gapAfter: 12 });
  }
  if (options.notes !== false) {
    const secondary = scene.actions.filter((a) => !a.primary);
    if (secondary.length > 0) y += 8;
    for (const action of secondary) {
      add("note", `· ${action.label}${action.terms ? ` — ${action.terms}` : ""}`, px(14), "body", {
        actionId: action.id,
        disabled: action.disabledReason !== undefined,
        gapAfter: 4,
      });
    }
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
