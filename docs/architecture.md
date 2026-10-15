# System Architecture — `huodongxing-cli` (`huodongxing` / `hdx`)

## 1. System Purpose & Boundaries

`huodongxing-cli` provides a Single Source of Truth (SSOT) programmatic CLI, Node.js SDK, and OpenCLI adapter suite for **Huodongxing (活动行 · `https://www.huodongxing.com/`)**. It covers all 12 functional areas across Public Discovery, Authenticated Attendee User Center, and Organizer Console while enforcing strict pre-socket security rules and WAF rate-limit pacing.

```mermaid
flowchart TD
  CLI["CLI Binary (bin/huodongxing.js)\nhuodongxing / hdx"] --> Client["HuodongxingClient (src/index.js)\nDual-Engine Facade"]
  WebUI["Web Console SPA\n(public/index.html + public/app.js)"] --> Server["HTTP & SSE Server\n(src/server.js — hdx serve)"]
  Server --> Client
  Server --> Watchlist["Persistent Watchlist Store\n(src/watchlist-store.js)"]
  Server --> Diag["Diagnostic Reconciler\n(src/diagnose.js — 能读/能试/能调)"]
  OpenCLI["OpenCLI Adapter Suite\n(opencli-adapter/*.js)"] --> Parsers["SSOT Parsers & Contracts\n(src/parsers.js)"]
  Client --> Direct["DirectClient (src/direct-client.js)\nNode Fetch + Cookie Bootstrap"]
  Client --> Bridge["OpenCliClient (src/opencli-client.js)\nIn-Origin Browser Fetch Bridge"]
  Direct --> Guard["SecurityGuard & RequestPacer\n(src/security-guard.js)"]
  Bridge --> Guard
  Direct --> Parsers
  Bridge --> Parsers
  Client --> ICS["RFC 5545 iCal Exporter\n(src/ics.js)"]
  Client --> Diag
```

## 2. Module Ownership

| File | Responsibility |
| :--- | :--- |
| `src/version.js` | SSOT package version, name, license, and description from `package.json`. |
| `src/security-guard.js` | Pre-socket `SECURITY_ROUTE_DENYLIST` enforcement (`assertSafeRoute`, `inspectRouteSafety`, `assertSafeCliAction`) and sequential token-bucket `RequestPacer` (`minIntervalMs: 900`). |
| `src/parsers.js` | Pure deterministic HTML & inline SSR JSON parsers (`ativityJson`, `eventTicketsJson`, `formItemsJson`, `mUserState`, `currentUser`), `buildEventsUrl` (`d=ts` fix), bilingual city/region normalization (`佛山, 广州, 深圳`), and `scoreAndRankRecommendations`. |
| `src/direct-client.js` | Direct HTTP engine with `HDXWAFID` cookie capture, `ulcsFetch` (`curl_cffi` TLS impersonation + residential proxy) fallback, and Geetest v3 WAF redirect recovery. |
| `src/tunnel-fetch.js` | Multi-tier anti-WAF transport (`resilientFetch` local Clash proxy -> `ulcsFetch` `ultra-low-cost-scraper` Chrome 120 TLS impersonation & residential proxy -> `autoUnbanGeetest` via `ego-browser`). |
| `src/opencli-client.js` | OpenCLI Browser Bridge client executing in-origin `fetch()` via `opencli browser <session> eval`. |
| `src/ecosystem-digest.js` | 5-track ecosystem intelligence digest engine (`generateEcosystemDigest`, `classifyEventDomains`, `extractTechSignals`, online/hybrid webinar classifier). |
| `src/ics.js` | RFC 5545 `.ics` calendar generator for attendee tickets, regional recommendations, and watchlist items (`generateTicketsIcs`, `generateEventsIcs`, `parseTicketDateRange`). |
| `src/watchlist-store.js` | Persistent server/CLI watchlist store (`~/.config/huodongxing-cli/watchlist.json`, `WatchlistStore`) with CRUD, soft-delete (`archived`) / restore (`saved`), and `.ics` export. |
| `src/server.js` | HTTP + SSE real-time console server (`createConsoleServer`) serving `public/` and `/api/*` endpoints (`/api/recommend`, `/api/digest`, `/api/watchlist`, `/api/diagnose/*`). |
| `src/diagnose.js` | Diagnostic-First observability (`resolveRuntimeConfig`, `updateOperatorConfig`, `classifySample`, `runDiagnosticReconcile`). |
| `src/formatters.js` | Multi-format output renderers (`json`, `table`, `md`, `csv`). |
| `src/index.js` | Unified `HuodongxingClient` facade and SDK exports. |
| `bin/huodongxing.js` | Executable CLI entrypoint (`huodongxing` & `hdx`, including `recommend`, `digest`, `watchlist`, and `serve`). |
| `public/` | Zero-facade Regional Recommendation, Watchlist & Diagnostic Web Console (`index.html`, `app.js`, `styles/tokens.css`, `styles/main.css`). |
| `opencli-adapter/` | SSOT-delegating OpenCLI command definitions (`15` commands) synced to `~/.opencli/clis/huodongxing/` and upstream `@jackwener/opencli`. |

## 3. Reverse-Engineered Platform Contracts (`rea` AST Analysis)

- **SSR + Inline JSON Architecture**: Huodongxing serves C# ASP.NET MVC Razor pages with embedded JSON variables (`var ativityJson`, `var eventTicketsJson`, `var formItemsJson`, `var mUserState`, `var currentUser`).
- **Organizer Console API (`api.huodongxing.com`)**: Uses Hawk SHA-256 MAC headers (`Authorization: Hawk id="...", ts="...", nonce="...", mac="..."`) signed with `localStorage.getItem('appId')` and `localStorage.getItem('appToken')`.
- **OpenResty / Geetest v3 WAF Envelope**: Unpaced bursts exceeding **8 requests per 20-second window** trigger a `302` redirect to `https://verify.huodongxing.com/gt3`. `RequestPacer` defaults to `900ms` sequential spacing to remain safely below this limit.
- **Date Filter Contract (`d=ts`)**: Passing `d=ts` on `/events` without `date` or `dateTo` causes a backend `NullReferenceException` (HTTP 500). `buildEventsUrl` only sets `d=ts` when a date bound is present.
