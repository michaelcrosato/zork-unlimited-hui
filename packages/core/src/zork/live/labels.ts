import type { Action, ActionKind } from "../../scene.ts";
import { MAX_LABEL_LENGTH } from "../../scene.ts";
import type { QuestChoice } from "./quest-session.ts";

/** Shorten authored text to a label, keeping the full text for `detail`. */
export function clipLabel(text: string): { label: string; detail?: string } {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= MAX_LABEL_LENGTH) return { label: trimmed };
  const sentence = /^(.{12,76}?[.!?;])(?:\s|$)/.exec(trimmed)?.[1];
  const cut = sentence ?? `${trimmed.slice(0, MAX_LABEL_LENGTH - 1).replace(/\s+\S*$/, "")}…`;
  return { label: cut, detail: trimmed };
}

const ACTION_PREFIX: Partial<Record<QuestChoice["kind"], RegExp>> = {
  LOOK: /^(?:look(?:\s+at)?|inspect|examine)(?:\s+|$)/i,
  INSPECT: /^(?:look(?:\s+at)?|inspect|examine)(?:\s+|$)/i,
  READ: /^read(?:\s+|$)/i,
  INVENTORY: /^(?:inventory|review)\s*/i,
  TALK: /^(?:talk(?:\s+to)?|speak(?:\s+to)?)(?:\s+|$)/i,
  ASK: /^ask(?:\s+ask)?\s*:?\s*/i,
  MOVE: /^(?:move|go)(?:\s+|$)/i,
  ATTACK: /^(?:attack|strike)(?:\s+|$)/i,
  MANEUVER: /^(?:maneuver|commit)(?:\s+|$)/i,
  TAKE: /^(?:take(?:\s+|$)){1,2}/i,
  DROP: /^drop(?:\s+|$)/i,
  OPEN: /^open(?:\s+|$)/i,
  CLOSE: /^close(?:\s+|$)/i,
  UNLOCK: /^unlock(?:\s+|$)/i,
  USE: /^use(?:\s+|$)/i,
  GIVE: /^give(?:\s+|$)/i,
};

const AUTHORED_DECISION_STAGE = /^(?:CHOOSE|COMPARE|PREPARE(?: SUPPORT)?|REVIEW SUPPORT|FINAL COMMITMENT|BACK|LEAVE)\b/i;

const LANGUAGE: Record<QuestChoice["kind"], { group: string; verb: string; kind: ActionKind }> = {
  LOOK: { group: "Observe", verb: "Inspect", kind: "observe" },
  INSPECT: { group: "Observe", verb: "Inspect", kind: "observe" },
  READ: { group: "Observe", verb: "Read", kind: "observe" },
  INVENTORY: { group: "Observe", verb: "Review", kind: "observe" },
  TALK: { group: "Speak", verb: "Speak with", kind: "talk" },
  ASK: { group: "Ask", verb: "Ask", kind: "talk" },
  MOVE: { group: "Advance", verb: "Go", kind: "move" },
  ATTACK: { group: "Engage", verb: "Attack", kind: "engage" },
  MANEUVER: { group: "Engage", verb: "Commit", kind: "engage" },
  TAKE: { group: "Act", verb: "Take", kind: "use" },
  DROP: { group: "Act", verb: "Drop", kind: "use" },
  OPEN: { group: "Act", verb: "Open", kind: "use" },
  CLOSE: { group: "Act", verb: "Close", kind: "use" },
  UNLOCK: { group: "Act", verb: "Unlock", kind: "use" },
  USE: { group: "Act", verb: "Use", kind: "use" },
  GIVE: { group: "Act", verb: "Give", kind: "use" },
};

function readable(id: string): string {
  return id.replaceAll("_", " ").replaceAll(":", " · ");
}

/** Costs, checks and stakes for a quest choice, or undefined when it is free. */
export function questTerms(choice: QuestChoice): string | undefined {
  const terms: string[] = [];
  if (choice.skillDisclosure) terms.push(choice.skillDisclosure);
  else if (choice.skillCheck) {
    const c = choice.skillCheck;
    terms.push(`${c.skill} ${c.modifier >= 0 ? "+" : ""}${c.modifier} vs DC ${c.difficulty}${c.stakes ? ` · ${c.stakes}` : ""}`);
  }
  if (choice.combat) {
    const phase = choice.combat.phase?.replaceAll("_", " ") ?? "combat";
    terms.push(
      `${phase} · ATK ${choice.combat.attack_bonus >= 0 ? "+" : ""}${choice.combat.attack_bonus} · DEF ${choice.combat.defense_bonus >= 0 ? "+" : ""}${choice.combat.defense_bonus}`,
    );
  }
  if (choice.resources?.costs.length) terms.push(`Spend ${choice.resources.costs.map(readable).join(", ")}`);
  if (choice.resources?.gains.length) terms.push(`Gain ${choice.resources.gains.map(readable).join(", ")}`);
  return terms.length > 0 ? terms.join(" · ") : undefined;
}

/**
 * Turn an engine command such as `ASK: HUNT — Protect home and herd…` or
 * `look at Albany relief spear` into a short player-facing action. The
 * engine's choice id is untouched; only the label changes.
 */
export function questAction(choice: QuestChoice, id: string, primary: boolean): Action {
  const language = LANGUAGE[choice.kind];
  const subject = choice.command
    .trim()
    .replace(ACTION_PREFIX[choice.kind] ?? /$^/, "")
    .trim();
  const authoredStage = choice.kind === "ASK" && AUTHORED_DECISION_STAGE.test(subject);
  const raw = authoredStage || subject.length === 0 ? subject || language.verb : `${language.verb} ${subject}`;
  const { label, detail } = clipLabel(raw);
  const terms = questTerms(choice);
  return {
    id,
    label,
    kind: language.kind,
    group: language.group,
    primary,
    ...(detail !== undefined ? { detail } : {}),
    ...(terms !== undefined ? { terms } : {}),
  };
}

export function questGroupFor(kind: QuestChoice["kind"]): string {
  return LANGUAGE[kind].group;
}
