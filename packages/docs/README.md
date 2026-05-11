# basalted-docs

Basalt docs site — Astro + Starlight, deployed to Cloudflare Pages at
`docs.basalt.dev`.

```sh
bun install
bun run --cwd packages/docs dev
bun run --cwd packages/docs build
```

Content lives in `src/content/docs/`. Sidebar order is in `astro.config.mjs`.
