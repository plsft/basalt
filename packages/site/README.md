# basalted-site

Basalt marketing site. Astro static, deployed to Cloudflare Pages.

```sh
bun install
bun run --cwd packages/site dev
bun run --cwd packages/site build
```

Tokens come from `basalted-ui`; the site re-declares them as CSS variables in `src/styles/global.css` because Astro builds without a Tailwind dependency at the moment (kept dependency-light for fast deploys).
