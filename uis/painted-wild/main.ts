import { bootUi } from "@hui/shell";
import { uis } from "virtual:hui-gallery";
import { render } from "./render.ts";

void bootUi({ slug: "painted-wild", title: "The Painted Wild", gallery: uis, render });
