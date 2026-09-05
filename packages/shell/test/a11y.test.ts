/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { createMockClient, type GameClient, type Scene } from "@hui/core";
import { mountA11yMirror } from "@hui/shell";

function overworldScene(): Scene {
  const client = createMockClient();
  client.act("meta:begin");
  return client.scene();
}

function chapelScene(): Scene {
  const client: GameClient = createMockClient();
  client.act("meta:begin");
  client.act("talk:ysolde");
  client.act("choice:marsh_guide");
  client.act("choice:start_quest");
  client.act("move:north");
  return client.scene();
}

describe("accessibility mirror", () => {
  it("renders one labelled button per action", () => {
    const scene = overworldScene();
    const root = document.createElement("div");
    const mirror = mountA11yMirror(root, () => {});
    mirror.update(scene);
    const buttons = [...root.querySelectorAll("button")];
    expect(buttons).toHaveLength(scene.actions.length);
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(scene.actions.map((a) => expect.stringContaining(a.label)));
  });

  it("reports the action id when a button is clicked", () => {
    const scene = overworldScene();
    const root = document.createElement("div");
    const acted: string[] = [];
    mountA11yMirror(root, (id) => acted.push(id)).update(scene);
    root.querySelectorAll("button")[1]!.click();
    expect(acted).toEqual([scene.actions[1]!.id]);
  });

  it("disables blocked actions and links their reason", () => {
    const scene = chapelScene();
    const blocked = scene.actions.find((a) => a.disabledReason);
    expect(blocked).toBeDefined();
    const root = document.createElement("div");
    mountA11yMirror(root, () => {}).update(scene);
    const button = [...root.querySelectorAll("button")].find((b) => b.textContent?.includes(blocked!.label))!;
    expect(button.disabled).toBe(true);
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(root.querySelector(`#${describedBy}`)?.textContent).toContain(blocked!.disabledReason);
  });

  it("announces the place, prose and latest result in a live region", () => {
    const scene = overworldScene();
    const root = document.createElement("div");
    mountA11yMirror(root, () => {}).update(scene);
    const live = root.querySelector("[aria-live]");
    expect(live).not.toBeNull();
    expect(live!.textContent).toContain(scene.place.name);
    expect(live!.textContent).toContain(scene.prose[0]!);
    expect(live!.textContent).toContain(scene.result);
  });

  it("replaces the buttons when the scene changes", () => {
    const root = document.createElement("div");
    const mirror = mountA11yMirror(root, () => {});
    mirror.update(overworldScene());
    const chapel = chapelScene();
    mirror.update(chapel);
    expect(root.querySelectorAll("button")).toHaveLength(chapel.actions.length);
  });

  it("is hidden visually but not from assistive technology", () => {
    const root = document.createElement("div");
    mountA11yMirror(root, () => {}).update(overworldScene());
    const region = root.firstElementChild as HTMLElement;
    expect(region.getAttribute("aria-hidden")).not.toBe("true");
    expect(region.className).toContain("hui-a11y");
  });

  it("removes its markup on destroy", () => {
    const root = document.createElement("div");
    const mirror = mountA11yMirror(root, () => {});
    mirror.update(overworldScene());
    mirror.destroy();
    expect(root.childElementCount).toBe(0);
  });
});
