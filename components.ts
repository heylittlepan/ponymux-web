import { defineComponents } from "blume";
import AgentWaitingRoom from "./components/AgentWaitingRoom.astro";
import MuxLandscape from "./components/MuxLandscape.astro";
import PonyHeader from "./components/PonyHeader.astro";
import SessionModel from "./components/SessionModel.astro";

export default defineComponents({
  mdx: {
    AgentWaitingRoom,
    MuxLandscape,
    SessionModel,
  },
  layout: {
    Header: PonyHeader,
  },
});
