import { defineComponents } from "blume";
import PonyHeader from "./components/PonyHeader.astro";

export default defineComponents({
  layout: {
    Header: PonyHeader,
  },
});
