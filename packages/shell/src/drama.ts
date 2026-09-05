import type { DiceRoll, Scene } from "@hui/core";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function placeSeed(id: string): number {
  let hash = 2166136261;
  for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0) % 10007 / 101;
}

export type Beat = "arrival" | "travel" | "choice" | "roll" | "damage" | "victory" | "death" | "action";

/** Presentation clock only: it neither rolls dice nor postpones engine actions. */
export class Drama {
  scene: Scene;
  beat: Beat = "arrival";
  started = 0;
  lastRolls: DiceRoll[] = [];
  private sequence = -1;
  private visited = new Set<string>();
  private rolling = false;
  private duration = 2.4;

  constructor(scene: Scene) { this.scene = scene; this.visited.add(scene.place.id); }

  update(next: Scene, time: number): boolean {
    const event = next.presentation;
    if (!event && next.sceneId === this.scene.sceneId && next.place.id === this.scene.place.id
      && next.goal.status === this.scene.goal.status && next.vitals.hp === this.scene.vitals.hp && this.sequence === -1) return false;
    if (event && event.sequence === this.sequence && next.sceneId === this.scene.sceneId) return false;
    const before = this.scene;
    this.scene = next;
    this.visited.add(next.place.id);
    this.sequence = event?.sequence ?? -1;
    this.started = time;
    this.rolling = Boolean(event?.rolls.length);
    if (this.rolling) this.lastRolls = event!.rolls;
    this.beat = next.ending?.death || (next.vitals.hp <= 0 && before.vitals.hp > 0) ? "death"
      : next.goal.status === "completed" && before.goal.status !== "completed" ? "victory"
      : this.rolling ? "roll"
      : (event?.damageTaken ?? 0) > 0 ? "damage"
      : before.place.id !== next.place.id ? "travel"
      : event?.kind === "choice" || next.phase === "story_choice" ? "choice" : "action";
    this.duration = this.rolling ? Math.ceil(this.lastRolls.length / 2) * 3.4 + 0.4 : this.beat === "victory" ? 4.5 : 2.4;
    return true;
  }

  replay(time: number): void {
    if (!this.lastRolls.length) return;
    this.started = time;
    this.rolling = true;
    this.beat = "roll";
    this.duration = Math.ceil(this.lastRolls.length / 2) * 3.4 + 0.4;
  }

  skip(time: number): void { this.started = time - this.duration; }

  sample(time: number, reduced = false) {
    const age = Math.max(0, time - this.started);
    const batch = Math.min(Math.max(0, Math.ceil(this.lastRolls.length / 2) - 1), Math.floor(age / 3.4));
    const rollingAge = reduced ? 2 : age - batch * 3.4;
    const rolls = this.rolling && age < this.duration ? this.lastRolls.slice(batch * 2, batch * 2 + 2) : [];
    const rollImpact = rolls.length ? Math.exp(-Math.pow((rollingAge - 1.55) / 0.23, 2)) : 0;
    const impact = reduced ? 0 : Math.max(rollImpact,
      this.beat === "damage" ? Math.exp(-age * 4) : this.beat === "victory" ? Math.exp(-Math.pow((age - 0.7) / 0.4, 2)) : 0);
    return {
      age, beat: this.beat, rolls, rollingAge, revealed: reduced || rollingAge >= 1.4,
      transition: reduced ? 1 : clamp(age / (this.beat === "travel" ? 1.8 : 1.15)),
      impact,
      travel: !reduced && (this.beat === "travel" || this.beat === "arrival") ? Math.sin(clamp(age / 2.4) * Math.PI) : 0,
      victory: this.beat === "victory" ? reduced ? 0 : Math.sin(clamp(age / 4.5) * Math.PI) : 0,
      active: age < this.duration,
      progress: this.scene.goal.status === "completed" ? 1 : Math.min(0.85, (this.visited.size - 1) * 0.09 + (this.scene.phase === "quest" ? 0.2 : 0)),
      seed: placeSeed(this.scene.place.id),
      combat: this.scene.actions.some(a => a.kind === "engage" && !a.disabledReason),
    };
  }
}

export type DramaFrame = ReturnType<Drama["sample"]>;

export function rollEquation(roll: DiceRoll): string {
  const modifier = roll.modifier >= 0 ? `+ ${roll.modifier}` : `− ${Math.abs(roll.modifier)}`;
  return roll.sides === 20 ? `${roll.value} ${modifier} = ${roll.total}  /  DC ${roll.target}`
    : `${roll.value} ${modifier} → ${roll.total} DAMAGE${roll.value + roll.modifier < 1 ? " (MIN 1)" : ""}`;
}
