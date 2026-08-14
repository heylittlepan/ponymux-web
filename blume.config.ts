import { defineConfig } from "blume";
import type { ComponentMarkdown } from "blume";
import { z } from "zod";

const agentWaitingRoomMarkdown: ComponentMarkdown = () => `
*Illustration: several coding-agent sessions wait quietly in different states while one terminal remains in focus.*
`;

const postMetaMarkdown: ComponentMarkdown = ({ frontmatter }) => {
  const rawAuthors = Array.isArray(frontmatter.authors)
    ? frontmatter.authors
    : frontmatter.authors
      ? [frontmatter.authors]
      : [];
  const names = rawAuthors
    .map((author) =>
      typeof author === "string"
        ? author
        : author && typeof author === "object" && "name" in author
          ? String(author.name)
          : ""
    )
    .filter(Boolean)
    .join(" and ");
  const date = frontmatter.date
    ? new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
        year: "numeric",
      }).format(new Date(frontmatter.date as string | Date))
    : "";
  const parts = [names ? `By ${names}` : "", date].filter(Boolean);

  return parts.length > 0 ? `*${parts.join(" · ")}*\n` : "";
};

const muxLandscapeMarkdown: ComponentMarkdown = () => `
**Three ways to frame the terminal**

- cmux — command center
- Herdr — agent-aware mux
- Otty — agent workspace

Three muxes, three different ideas about what belongs inside the terminal.
`;

const sessionModelMarkdown: ComponentMarkdown = () => `
**Same sessions, different mental model**

- Keep everything visible — manage space.
- Keep one thing in focus — manage attention.

More sessions don’t have to mean more terminals on screen.
`;

export default defineConfig({
  title: "PonyMux",
  description:
    "PonyMux is a lightweight native Mac terminal for managing more coding agents and sessions without split-pane clutter.",
  logo: {
    image: "/favicon.svg",
    text: "PonyMux",
    href: "/",
  },
  navigation: {
    tabs: [
      { label: "Blog", path: "/blog", href: "/blog" },
      { label: "Docs", path: "/docs" },
    ],
  },
  analytics: {
    scripts: [
      {
        src: "/p/pony.js",
        strategy: "defer",
        attributes: {
          "data-website-id": "78bc9b17-4037-4a3f-97cc-7241f6bc0285",
          "data-host-url": "/p",
          "data-domains": "ponymux.com",
          "data-do-not-track": "true",
          "data-exclude-hash": "true",
          "data-performance": "true",
        },
      },
    ],
  },
  frontmatter: {
    extend: {
      cover: z
        .object({
          dark: z.string(),
          light: z.string(),
        })
        .optional(),
    },
  },
  ai: {
    markdownComponents: {
      AgentWaitingRoom: agentWaitingRoomMarkdown,
      MuxLandscape: muxLandscapeMarkdown,
      PostMeta: postMetaMarkdown,
      SessionModel: sessionModelMarkdown,
    },
  },
  theme: {
    accent: { light: "#1e66f5", dark: "#7aa2f7" },
    action: "#7aa2f7",
    radius: "lg",
    mode: "dark",
    fonts: {
      display: "manrope",
      body: "inter",
      mono: "geist-mono",
    },
    background: { light: "#eff1f5", dark: "#1a1b26" },
  },
  deployment: {
    site: "https://ponymux.com",
  },
  seo: {
    sitemap: true,
    robots: true,
    structuredData: true,
    rss: { enabled: true, types: ["blog"] },
    og: {
      enabled: true,
      logo: "/favicon.svg",
      site: "ponymux.com",
      palette: {
        accent: "#7aa2f7",
        background: "#1a1b26",
        foreground: "#c0caf5",
        muted: "#7982ad",
        border: "#31354a",
      },
    },
  },
});
