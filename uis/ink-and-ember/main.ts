import { bootUi } from "@hui/shell";
import { uis } from "virtual:hui-gallery";
import { renderInkAndEmber } from "./render.ts";

void bootUi({
  slug: "ink-and-ember",
  title: "Ink & Ember",
  gallery: uis,
  render: renderInkAndEmber,
});
