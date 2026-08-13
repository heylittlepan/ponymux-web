import { defineConfig } from "blume";

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
      { label: "Blog", path: "/blog" },
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
