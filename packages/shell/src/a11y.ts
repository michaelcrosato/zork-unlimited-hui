import type { Scene } from "@hui/core";

export interface A11yMirror {
  update(scene: Scene): void;
  /** Move keyboard focus to the nth action button. */
  focusAction(index: number): void;
  destroy(): void;
}

let nextId = 0;

/**
 * A DOM twin of the GPU-rendered scene: a live region with the place, prose,
 * dialogue and latest result, and one real `<button>` per action. It is
 * visually hidden (see shell.css) but fully available to screen readers and
 * the keyboard, so the game stays playable without a single pixel.
 */
export function mountA11yMirror(root: HTMLElement, onAct: (id: string) => void): A11yMirror {
  const region = document.createElement("div");
  region.className = "hui-a11y";
  const live = document.createElement("section");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  const list = document.createElement("ul");
  list.setAttribute("aria-label", "Actions");
  region.append(live, list);
  root.append(region);

  return {
    update(scene) {
      live.replaceChildren();
      const heading = document.createElement("h2");
      heading.textContent = scene.place.kicker ? `${scene.place.name} — ${scene.place.kicker}` : scene.place.name;
      live.append(heading);
      for (const paragraph of scene.prose) {
        const p = document.createElement("p");
        p.textContent = paragraph;
        live.append(p);
      }
      if (scene.dialogue) {
        const quote = document.createElement("blockquote");
        quote.textContent = `${scene.dialogue.speaker}: ${scene.dialogue.text}`;
        live.append(quote);
      }
      const result = document.createElement("p");
      result.textContent = `Latest result: ${scene.result}`;
      live.append(result);

      list.replaceChildren();
      let number = 0;
      for (const action of scene.actions) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        number += action.primary ? 1 : 0;
        button.textContent = action.primary ? `${number}. ${action.label}` : action.label;
        const notes = [action.terms, action.consequence, action.disabledReason].filter(Boolean);
        if (notes.length > 0) {
          const note = document.createElement("span");
          note.id = `hui-a11y-${nextId++}`;
          note.textContent = notes.join(". ");
          button.setAttribute("aria-describedby", note.id);
          item.append(button, note);
        } else {
          item.append(button);
        }
        if (action.disabledReason) button.disabled = true;
        button.addEventListener("click", () => onAct(action.id));
        list.append(item);
      }
    },
    focusAction(index) {
      [...list.querySelectorAll("button")][index]?.focus();
    },
    destroy() {
      region.remove();
    },
  };
}
