import { defineConfig } from "vitepress";

const base = "/explain-to-customer/";
const site = "https://halitsever.github.io/explain-to-customer/";
const description = "A Claude Code skill that turns a code change into a short video, slides and diagrams your client understands.";

export default defineConfig({
  base,
  lang: "en-US",
  title: "explain-to-customer",
  titleTemplate: ":title | explain-to-customer",
  description,
  cleanUrls: true,
  appearance: "dark",
  markdown: { theme: { light: "vitesse-light", dark: "vitesse-dark" } },
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: `${base}brand/logo-mark-dark.svg` }],
    ["link", { rel: "apple-touch-icon", href: `${base}brand/avatar-512.png` }],
    ["meta", { name: "theme-color", content: "#1F1D1A" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:url", content: site }],
    ["meta", { property: "og:title", content: "explain-to-customer" }],
    ["meta", { property: "og:description", content: description }],
    ["meta", { property: "og:image", content: `${site}brand/social-preview-1280x640.png` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:image", content: `${site}brand/social-preview-1280x640.png` }],
  ],
  themeConfig: {
    logo: { light: "/brand/logo-mark.svg", dark: "/brand/logo-mark-dark.svg", alt: "" },
    siteTitle: "explain-to-customer",
    nav: [
      { text: "Guide", link: "/guide/getting-started", activeMatch: "/guide/" },
      { text: "Styles", link: "/guide/styles" },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Start here",
          items: [
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Usage", link: "/guide/usage" },
          ],
        },
        {
          text: "What you get",
          items: [
            { text: "Outputs", link: "/guide/outputs" },
            { text: "Styles", link: "/guide/styles" },
          ],
        },
        {
          text: "Under the hood",
          items: [
            { text: "How it works", link: "/guide/how-it-works" },
            { text: "Privacy and honesty", link: "/guide/privacy" },
            { text: "Troubleshooting", link: "/guide/troubleshooting" },
          ],
        },
      ],
    },
    socialLinks: [{ icon: "github", link: "https://github.com/halitsever/explain-to-customer" }],
    search: { provider: "local" },
    editLink: {
      pattern: "https://github.com/halitsever/explain-to-customer/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    outline: { level: [2, 3] },
    docFooter: { prev: "Previous", next: "Next" },
  },
});
