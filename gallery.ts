import { uis } from "virtual:hui-gallery";

const list = document.getElementById("gallery")!;
const status = document.getElementById("status")!;

if (uis.length === 0) {
  list.innerHTML = `<li><a href="#"><strong>No interfaces yet</strong><span>Run <code>pnpm new-ui &lt;slug&gt;</code> to scaffold one.</span></a></li>`;
}

for (const ui of uis) {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = `/uis/${ui.slug}/`;
  a.style.setProperty("--accent", ui.accent);
  a.style.borderLeftColor = ui.accent;
  a.innerHTML = `<strong>${ui.title}</strong><span>${ui.tagline}</span><small>${ui.techniques.join(" · ")}</small>`;
  li.appendChild(a);
  list.appendChild(li);
}

const gpu = "gpu" in navigator ? "WebGPU available" : "WebGPU not available in this browser";
const engine = __ENGINE_AVAILABLE__ ? "engine linked: live play" : "engine not linked: mock world";
status.textContent = `${gpu} · ${engine}`;
