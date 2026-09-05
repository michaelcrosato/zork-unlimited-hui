export interface HudInit {
  root: HTMLElement;
  slug: string;
  title: string;
  clientKind: "mock" | "live";
  liveAvailable: boolean;
  gallery: { slug: string; title: string }[];
}

export interface Hud {
  setFps(fps: number): void;
  notice(text: string, tone?: "info" | "error"): void;
  destroy(): void;
}

/**
 * The small chrome every interface shares: which interface and client are
 * running, links to the others, a frame-rate readout and a notice line.
 */
export function mountHud(init: HudInit): Hud {
  const bar = document.createElement("header");
  bar.className = "hui-hud";
  const otherUis = init.gallery.filter((ui) => ui.slug !== init.slug);
  const switcher = otherUis.length
    ? `<nav aria-label="Other interfaces">${otherUis
        .map((ui) => `<a href="/uis/${ui.slug}/?client=${init.clientKind}">${ui.title}</a>`)
        .join("")}</nav>`
    : "";
  const otherClient = init.clientKind === "live" ? "mock" : "live";
  const toggle = init.liveAvailable
    ? `<a class="hui-hud-client" href="?client=${otherClient}">${init.clientKind} world · switch to ${otherClient}</a>`
    : `<span class="hui-hud-client">mock world · engine not linked</span>`;
  bar.innerHTML = `<a class="hui-hud-home" href="/">zork-unlimited-hui</a><strong>${init.title}</strong>${switcher}${toggle}<span class="hui-hud-fps" aria-label="frames per second">– fps</span><span class="hui-hud-notice" role="status"></span>`;
  init.root.append(bar);
  const fps = bar.querySelector<HTMLSpanElement>(".hui-hud-fps")!;
  const notice = bar.querySelector<HTMLSpanElement>(".hui-hud-notice")!;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    setFps(value) {
      fps.textContent = `${Math.round(value)} fps`;
    },
    notice(text, tone = "info") {
      notice.textContent = text;
      notice.dataset.tone = tone;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        notice.textContent = "";
      }, 6000);
    },
    destroy() {
      bar.remove();
    },
  };
}
