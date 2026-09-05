import type { JourneyChoicePrompt, JourneyStoryChoiceOption, JourneyStoryChoicePrompt } from "@zork/world/journey_contract.js";
import type { Action } from "../../scene.ts";
import { clipLabel } from "./labels.ts";

export interface StoryPresentation {
  kicker: string;
  title: string;
  prose: string[];
  actions: Action[];
}

const KICKERS: Record<NonNullable<JourneyStoryChoicePrompt["kind"]> | "aftermath", [string, string]> = {
  registration: ["Choose your background", "Choose how to begin"],
  lead_source: ["Wolf-Winter report", "Choose the report you trust"],
  preparation: ["Optional field kit", "Choose one field kit"],
  ally: ["Optional second rider", "Choose a second rider or ride alone"],
  relief_allocation: ["Optional relief wagon", "Choose where the relief wagon goes"],
  relief_oath: ["Wolf-Winter promise", "Choose one promise"],
  aftermath: ["Journey choice", "Choose what follows"],
};

function optionAction(option: JourneyStoryChoiceOption, id: string): Action {
  const summary = option.summary;
  const { label, detail: clippedDetail } = clipLabel(option.label);
  const terms = summary ? [summary.commitment, summary.fieldTrigger].filter(Boolean).join(" · ") : undefined;
  const consequence = summary
    ? [summary.immediateCost ? `Cost: ${summary.immediateCost}` : "", summary.tradeoff ? `Give up: ${summary.tradeoff}` : ""].filter(Boolean).join(" · ")
    : option.consequence;
  const detail = [clippedDetail, option.consequence, option.dispatchImpact?.line, option.dispatchForecast?.line].filter(Boolean).join(" ");
  return {
    id,
    label,
    kind: "choice",
    group: "Choice",
    primary: true,
    ...(terms ? { terms } : {}),
    ...(consequence ? { consequence } : {}),
    ...(detail ? { detail } : {}),
  };
}

/**
 * A story prompt (background, promise, report, kit, rider, wagon, aftermath)
 * as prose plus one choice per visible option, a reveal action while a
 * progressive disclosure is still folded, and a dismiss action when the prompt
 * was only opened for inspection from the Station.
 */
export function presentStoryChoice(
  prompt: JourneyStoryChoicePrompt,
  visible: readonly JourneyStoryChoiceOption[],
  inspected: boolean,
  register: (id: string, run: () => void) => void,
  handlers: { choose(optionId: string): void; reveal(revealId: string): void; dismiss(): void },
): StoryPresentation {
  const [kicker, title] = KICKERS[prompt.kind ?? "aftermath"];
  const actions: Action[] = visible.map((option) => {
    const id = `story:${option.id}`;
    register(id, () => handlers.choose(option.id));
    return optionAction(option, id);
  });
  const disclosure = prompt.progressiveDisclosure;
  if (disclosure && !disclosure.reveal.optionIds.some((optionId) => visible.some((option) => option.id === optionId))) {
    const id = `story:reveal:${disclosure.reveal.id}`;
    register(id, () => handlers.reveal(disclosure.reveal.id));
    actions.push({
      id,
      label: clipLabel(disclosure.reveal.label).label,
      kind: "meta",
      group: "Compare",
      detail: disclosure.reveal.description,
      primary: true,
    });
  }
  if (inspected) {
    register("story:dismiss", () => handlers.dismiss());
    actions.push({ id: "story:dismiss", label: "Return to the Station without choosing", kind: "meta", group: "Return", primary: true });
  }
  return { kicker, title, prose: [prompt.message], actions };
}

/** The Continue / End pause after a goal, a checkpoint, or a death. */
export function presentJourneyChoice(
  prompt: JourneyChoicePrompt,
  register: (id: string, run: () => void) => void,
  choose: (choice: "continue" | "end") => void,
): StoryPresentation {
  const died = prompt.reasons.includes("character_died");
  const prose = [prompt.message];
  if (prompt.continuationPreview) {
    prose.push(prompt.continuationPreview.message);
    for (const option of prompt.continuationPreview.options) prose.push(`If you continue, ${option.label}: ${option.consequence}`);
  }
  const actions: Action[] = prompt.options.map((option) => {
    const id = `journey:${option.id}`;
    register(id, () => choose(option.id));
    return { id, label: option.label, kind: "choice", group: "Journey", consequence: option.consequence, primary: true };
  });
  return {
    kicker: `Journey decision ${prompt.atDecision}`,
    title: died ? "Your character died" : "Continue this journey?",
    prose,
    actions,
  };
}
