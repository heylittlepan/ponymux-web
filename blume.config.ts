import { defineConfig } from "blume";

export default defineConfig({
  title: "PonyMux",
  description:
    "PonyMux is a lightweight native Mac terminal for managing more coding agents and sessions without split-pane clutter.",
  logo: {
    image: "/favicon.png",
    text: "PonyMux",
    href: "/",
  },
  navigation: {
    tabs: [
      { label: "Blog", path: "/blog" },
      { label: "Docs", path: "/docs" },
    ],
  },
  theme: {
    accent: { light: "#1478ff", dark: "#65a7ff" },
    action: "#1478ff",
    radius: "lg",
    mode: "system",
    fonts: {
      display: "manrope",
      body: "inter",
      mono: "geist-mono",
    },
    background: { light: "#f7f5f0", dark: "#111117" },
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
      logo: "/favicon.png",
      site: "ponymux.com",
      palette: {
        accent: "#1478ff",
        background: "#111117",
        foreground: "#f7f5f0",
        muted: "#a3a3ad",
        border: "#2b2b34",
      },
    },
  },
});
