import { bootUi } from "@hui/shell";
import { uis } from "virtual:hui-gallery";
import { renderCartographer } from "./render.ts";

void bootUi({
  slug: "cartographer",
  title: "Cartographer",
  gallery: uis,
  render: renderCartographer,
});
