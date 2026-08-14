import { defineComponents } from "blume";
import MuxLandscape from "./components/MuxLandscape.astro";
import PonyHeader from "./components/PonyHeader.astro";
import SessionModel from "./components/SessionModel.astro";

export default defineComponents({
  mdx: {
    MuxLandscape,
    SessionModel,
  },
  layout: {
    Header: PonyHeader,
  },
});
