import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://basalted.com",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [mdx(), sitemap()],
  vite: {
    ssr: { noExternal: ["basalted-ui"] },
  },
});
