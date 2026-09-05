import { bootUi } from "@hui/shell";
import { uis } from "virtual:hui-gallery";
import { render } from "./render.ts";

void bootUi({ slug: "tideglass", title: "Tideglass", gallery: uis, render });
