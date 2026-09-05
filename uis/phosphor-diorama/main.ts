import { bootUi } from "@hui/shell";
import { uis } from "virtual:hui-gallery";
import { renderPhosphorDiorama } from "./render.ts";

void bootUi({
  slug: "phosphor-diorama",
  title: "Phosphor Diorama",
  gallery: uis,
  render: renderPhosphorDiorama,
});
