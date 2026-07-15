# AGENTS.md

## Project

**side-meow** — Chrome/Edge Manifest V3 Side Panel extension for managing multiple LLM API configurations, testing via integrated chat, and exporting to [CC Switch](https://github.com/farion1231/cc-switch) via `ccswitch://` Deep Link.

## Dev Commands

```bash
npm install
npm run dev          # Vite dev server with CRXJS HMR
npm run build        # Production build to dist/
npm run package      # cd dist && zip (PowerShell)
```

No lint, typecheck, or test scripts exist. Build success is the only verification.

## Architecture

- **Side Panel** (not Popup) — persists across navigation, hosts all UI
- **Background Service Worker** (`src/background/index.js`) — proxies all API requests, manages `declarativeNetRequest` header rules, handles `FETCH_MODELS` and `API_REQUEST` messages
- **Svelte 5** with `$state`, `$derived`, `$effect`, `$props`, `$bindable` (runes mode — no `$:` reactive statements)
- **No TypeScript** — plain `.js` with JSDoc where needed
- **No test framework** — no tests exist

## Source Layout

```
src/
  manifest.json                    # MV3, permissions: sidePanel, storage, activeTab, declarativeNetRequestWithHostAccess
  background/index.js              # Service Worker — API proxy, model fetch, header rules
  sidepanel/
    index.html, main.js, App.svelte
    pages/       — Home, ProviderForm, Chat, Settings, Export
    components/  — 11 components (ProviderCard, ChatInput, MessageBubble, ModelSelector, etc.)
    stores/      — providers.js, sessions.js, settings.js, ui.js
  lib/
    api/         — header-presets.js, models.js
    ccswitch/    — mapper.js, deeplink.js
    storage/     — chrome-storage.js (all persistence via chrome.storage.local)
    constants.js, highlight.js, tokens.js, uuid.js
rules/
  ua-override.json                 # declarativeNetRequest rules (lives at project root, not src/)
```

## Key Patterns

**Persistence**: All data goes through `src/lib/storage/chrome-storage.js`. Keys are prefixed `api_sider_` (e.g. `api_sider_providers`, `api_sider_sessions`). Stores use `getStorage`/`setStorage` — never raw `chrome.storage` calls.

**API requests**: Side panel sends `API_REQUEST` message → background worker `buildRequest()` constructs headers/body per provider type (`openai`/`anthropic`/`gemini`) → `fetch()` → streams SSE chunks back via `API_STREAM_CHUNK`/`API_STREAM_DONE`/`API_ERROR` messages. Custom headers from provider config are spread into the request (except `User-Agent` which is forbidden in fetch API — handled by declarativeNetRequest).

**Header spoofing**: `declarativeNetRequest` replaces `User-Agent` and strips `sec-ch-ua*`, `sec-fetch-*`, `Origin`, `Referer` on all XHR requests. Rules are set dynamically on service worker startup (`initHeaderRules`). Custom `User-Agent` in provider headers triggers `syncUserAgentRule()` to update the rule. See `rules/ua-override.json` for static fallback.

**CC Switch export**: V1 Deep Link protocol `ccswitch://v1/import?resource=provider&app={app}&name={name}&endpoint={url}&apiKey={key}&model={model}`. Each import is single-provider. Batch = sequential `window.open` calls. Detection uses `blur` event after opening first link.

**Navigation**: Page routing via `stores/ui.js` `currentPage` store. `App.svelte` maps page names to components. No router library.

**Health checks**: `providers.js` `healthCheckProvider()` sends a minimal API request and stores `provider.healthCheck` (`{status, latency, error, lastCheck}`). `ProviderCard` shows colored border/background based on result.

## Styling

- **Global CSS** in `src/assets/styles/global.css` — CSS variables, utility classes (`.card`, `.btn-primary`, `.btn-secondary`, `.page-header`, `.section-stack`, etc.)
- **Tailwind 4** via `@tailwindcss/vite` plugin — available but most styling uses CSS variables and scoped `<style>` blocks
- **Dark-only** — no light theme. `color-scheme: dark` in CSS
- **No emojis in code** unless user requests

## CRXJS Gotchas

- `@crxjs/vite-plugin` 2.0.0-beta.28 — pinned. If build breaks, check CRXJS GitHub issues
- Static assets referenced in manifest (like `rules/ua-override.json`) must be at **project root**, not inside `src/`
- SSR warnings about `<button>` inside `<button>` are harmless — this is a client-only extension, never SSR
- `minimum_chrome_version: "114"` required for Side Panel API

## Design Docs

- `PRD.md` — product requirements
- `DESIGN.md` — technical design (data structures, API specs, UI layouts)
- `PLAN.md` — development plan with task-to-file mapping

These may be outdated relative to the actual implementation. Trust the code over the docs.
