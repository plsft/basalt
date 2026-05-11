import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://docs.basalted.com",
  integrations: [
    starlight({
      title: "Basalt",
      description: "A second-brain compiler. Compiles you, not the corpus.",
      social: {
        github: "https://github.com/plsft/basalt",
      },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        { label: "Overview", link: "/" },
        { label: "v1.4.0 — Self-hosting", link: "/v1.4.0-selfhost/" },
        { label: "v1.3.0 — Multi-vault search", link: "/v1.3.0-search/" },
        { label: "v1.2.0 — Mobile (PWA)", link: "/v1.2.0-mobile/" },
        { label: "What's new in v1.1.0", link: "/v1.1.0/" },
        {
          label: "Getting Started",
          items: [
            { label: "CLI", link: "/getting-started/cli/" },
            { label: "Obsidian plugin", link: "/getting-started/plugin/" },
            { label: "MCP server", link: "/getting-started/mcp/" },
            { label: "Desktop", link: "/getting-started/desktop/" },
            { label: "Web cockpit", link: "/getting-started/web/" },
          ],
        },
        {
          label: "Verbs",
          items: [
            { label: "Overview", link: "/verbs/" },
            { label: "Implicit Thesis (Na)", link: "/verbs/thesis/" },
            { label: "Contradiction (Cl)", link: "/verbs/contradiction/" },
            { label: "Drift (Hg)", link: "/verbs/drift/" },
            { label: "Connection (C)", link: "/verbs/connection/" },
            { label: "Buried Insight (Au)", link: "/verbs/buried/" },
          ],
        },
        {
          label: "BYOK",
          items: [
            { label: "Overview", link: "/byok/" },
            { label: "OpenAI", link: "/byok/openai/" },
            { label: "Anthropic", link: "/byok/anthropic/" },
            { label: "Google", link: "/byok/google/" },
          ],
        },
        {
          label: "Privacy",
          items: [
            { label: "Overview", link: "/privacy/" },
            { label: "Threat model", link: "/privacy/threat-model/" },
          ],
        },
        {
          label: "Migration",
          items: [{ label: "Python → TS", link: "/migration/python-to-ts/" }],
        },
        {
          label: "API",
          items: [
            { label: "Overview", link: "/api/" },
            { label: "Reference", link: "/api/reference/" },
          ],
        },
      ],
    }),
  ],
});
