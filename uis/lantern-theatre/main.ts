import { bootUi } from "@hui/shell";
import { uis } from "virtual:hui-gallery";
import { render } from "./render.ts";

void bootUi({ slug: "lantern-theatre", title: "Lantern Theatre", gallery: uis, render });
