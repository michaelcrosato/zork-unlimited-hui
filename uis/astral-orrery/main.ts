import { bootUi } from "@hui/shell";
import { uis } from "virtual:hui-gallery";
import { render } from "./render.ts";

void bootUi({ slug: "astral-orrery", title: "Astral Orrery", gallery: uis, render });
