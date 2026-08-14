import { defineComponents } from "blume";
import AgentWaitingRoom from "./components/AgentWaitingRoom.astro";
import MuxLandscape from "./components/MuxLandscape.astro";
import PonyFeedback from "./components/PonyFeedback.astro";
import PonyHeader from "./components/PonyHeader.astro";
import PostMeta from "./components/PostMeta.astro";
import SessionModel from "./components/SessionModel.astro";

export default defineComponents({
  mdx: {
    AgentWaitingRoom,
    MuxLandscape,
    PostMeta,
    SessionModel,
  },
  layout: {
    Feedback: PonyFeedback,
    Header: PonyHeader,
  },
});
