import type { ActionKind } from "./scene.ts";

export interface DiceRoll {
  sides: 6 | 20;
  value: number;
  modifier: number;
  total: number;
  target: number | null;
  role: "player" | "enemy" | "check";
  outcome: "hit" | "success" | "failure";
  label: string;
  /** Exact engine narration, including floors and damage arithmetic. */
  detail: string;
}

export interface Presentation {
  /** Monotonic for accepted actions in this client; never persisted as gameplay. */
  sequence: number;
  actionId: string;
  label: string;
  kind: ActionKind;
  narrations: string[];
  rolls: DiceRoll[];
  damageTaken: number;
}

/**
 * The engine reports its actual seeded dice in canonical narration. Recognise
 * only those complete forms, in order, and preserve the original message.
 * Never infer rolls from HP changes, arbitrary prose or an old journal.
 */
export function diceFromNarrations(narrations: readonly string[]): DiceRoll[] {
  const rolls: DiceRoll[] = [];
  for (const detail of narrations) {
    const check = /^([A-Za-z_][A-Za-z0-9_]*) check: d20 (\d+) \+ (-?\d+) = (-?\d+) vs (-?\d+) [—–-] (success|failure)\.$/.exec(detail.trim());
    if (check) {
      const value = Number(check[2]), modifier = Number(check[3]), total = Number(check[4]), target = Number(check[5]);
      const outcome = check[6] as "success" | "failure";
      if (value >= 1 && value <= 20 && value + modifier === total && (total >= target) === (outcome === "success")) {
        rolls.push({ sides: 20, value, modifier, total, target, role: "check", outcome, label: `${check[1]} check`, detail });
      }
      continue;
    }
    const combat = /^(You strike (.+?)|(.+?) hits you) for (\d+) \(d6 (\d+) \+ (-?\d+) atk - (-?\d+) def(?: = -?\d+, blunted to the floor of \d+)?; (?:it has|you have) \d+ HP left\)\.$/.exec(detail.trim());
    if (!combat) continue;
    const total = Number(combat[4]), value = Number(combat[5]), modifier = Number(combat[6]) - Number(combat[7]);
    if (value < 1 || value > 6 || Math.max(1, value + modifier) !== total) continue;
    const role = combat[2] ? "player" : "enemy";
    rolls.push({ sides: 6, value, modifier, total, target: null, role, outcome: "hit", label: role === "player" ? `Strike · ${combat[2]}` : `Counterstrike · ${combat[3]}`, detail });
  }
  return rolls;
}
