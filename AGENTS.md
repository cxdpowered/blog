# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Stack

Astro 5 blog (`output: 'server'`, Vercel adapter) using the vendored `astro-pure` theme as a workspace package. Bun is the package manager (`bun.lock`). TypeScript with `astro/tsconfigs/strict` + `verbatimModuleSyntax`.

## Commands

```bash
bun dev               # astro dev (with server.host = true)
bun build             # astro-pure check && astro check && astro build
bun preview
bun sync              # regenerate .astro types after content/config changes
bun check             # astro check (type-check .astro + TS)
bun lint              # eslint --fix on src/**
bun format            # prettier --write
bun yijiansilian      # lint + sync + check + format (run before committing)
bun cache:avatars     # preset/scripts/cacheAvatars.ts — pre-fetch friend-link avatars to public/avatars/
```

There is no test runner configured.

## Architecture

The repo has two layers:

1. **`packages/pure/`** — the `astro-pure` theme, consumed via the workspace link in `bun.lock` (resolved as `astro-pure` in `package.json`). Its `index.ts` exports an `AstroIntegration` that **auto-injects** `@astrojs/sitemap`, `@astrojs/mdx`, and `unocss` unless already present, then wires in remark/rehype plugins (`remarkReadingTime`, `remarkAddZoomable`, `rehypeExternalLinks`, `rehypeTable`) and a Vite plugin (`vitePluginUserConfig`) that exposes the user config as a virtual module. The `astro:build:done` hook shells out to `npx pagefind --site <dist>` for search indexing. Pages, layouts, and components are imported from this package via subpath exports (`astro-pure/components/pages`, `astro-pure/user`, `astro-pure/advanced`, `astro-pure/utils`, `astro-pure/server`, `astro-pure/types`, `astro-pure/libs`). When editing theme internals, work in `packages/pure/`; when customizing the site, work in `src/`.

2. **`src/`** — the consumer site. `src/site.config.ts` is the single source of truth for theme behavior (`theme`, `integ`, `terms` exports merged into the default `Config`); it is passed into `AstroPureIntegration(config)` in `astro.config.ts`. Changing anything here requires `bun sync` so the virtual-config types update.

### Content collections

Defined in `src/content.config.ts` using `astro/loaders`' `glob`. Only `blog` is active (docs collection is commented out). Blog schema (zod): `title` ≤60 chars, `description` ≤160, `publishDate` required, optional `heroImage` (object with `src: image()`), `tags` lowercased + deduped, plus `draft` and `comment` flags. Posts live in `src/content/blog/<slug>/index.md` (with co-located assets). `/src/content/blog/test.*` is gitignored.

### Markdown pipeline

`astro.config.ts` adds **on top of** what the theme injects:
- `remark-math` + `rehype-katex` for LaTeX
- `rehypeHeadingIds` + a local `rehype-auto-link-headings.ts` (append-behavior, `.anchor` class, `#` content)
- Shiki with custom transformers in `src/plugins/shiki-custom-transformers.ts` (`updateStyle`, `addTitle`, `addLanguage`, `addCopyButton`, `addCollapse(15)`) plus vendored official ones in `src/plugins/shiki-official/`. The `@ts-ignore` on each transformer is intentional — two `@shikijs/types` copies are present (root + nested under `@astrojs/markdown-remark`).

### Routing

`src/pages/` defines: `blog/[...id].astro` (post), `blog/[...page].astro` (paginated list, page size from `theme.content.blogPageSize`), `tags/`, `archives/`, `search/` (Pagefind), `projects/`, `links/`, `about/`, `terms/`, plus `rss.xml.ts` and `robots.txt.ts`. Layouts live in `src/layouts/`.

### Path aliases

`@/assets/*`, `@/components/*`, `@/layouts/*`, `@/plugins/*`, `@/pages/*`, `@/site-config`, `@/utils`, `@/utils/*`, `@/types` — defined in `tsconfig.json`.

## Conventions

- Prerendering is enabled (`prerender: true` in site config) and is required for Pagefind search to work — do not disable without removing search.
- Comment system is Waline; server URL is in `integ.waline.server` (currently a Vercel deployment).
- `preset/` holds optional resources (extra tool icons, experimental components, the avatar cache script) — not auto-imported; copy what you need into `src/`.
- ESLint ignores `public/scripts/*`, `scripts/*`, `.astro/`, `src/env.d.ts`.
- Repo language/audience is Chinese (post content, site title), but UI strings + code identifiers are English.
