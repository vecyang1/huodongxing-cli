# Changelog

All notable changes to `huodongxing-cli` are documented in this file.

## [1.2.3] - 2026-10-19

### Added
- **Ego-Browser Autonomous Cookie Self-Healing (`src/tunnel-fetch.js` & `src/direct-client.js`)**:
  - Added and exported `fetchFreshCookiesViaEgoBrowser` leveraging `ego-browser` Tier-1 DOM batching to retrieve valid `AccupassWeb` and `HDXWAFID` session cookies.
  - Wired autonomous cookie refresh into `DirectClient.fetchHtml` when Geetest 302 challenges persist, enabling seamless zero-touch unattended operation.

### Fixed
- **Per-City Fault Isolation in Regional Engine (`src/index.js`)**:
  - Wrapped individual city searches in `recommendEvents` with try-catch boundaries, ensuring single-city network jitter or rate limits never abort the overall GBA ranking.
- **Robust JSON Delimiter Boundary Parsing (`src/tunnel-fetch.js`)**:
  - Isolated JSON objects via first `{` and last `}` index boundaries in `ulcsFetch` stdout parser, preventing `SyntaxError` from terminal notices, shell banners, or telemetry directives.
- **ULCS CLI Parameter Forwarding Compatibility (`ultra-low-cost-scraper`)**:
  - Patched `scripts/scraper_cli.py` across all agent skills roots to accept `**kwargs: Any` in `fetch_url`, resolving the `TypeError` caused by modern `cache_ttl` arguments.

## [1.2.2] - 2026-10-18

### Fixed
- **Active Local Override Priority in Diagnostic Reconciler (`src/diagnose.js`)**:
  - Updated `checkUpstreamAdapterStatus` to prioritize the active OpenCLI local override path (`~/.opencli/clis/huodongxing/events.js`) over the raw global npm package path (`~/.hermes/node/lib/node_modules/@jackwener/opencli/clis/huodongxing/events.js`), preventing false-positive `unpatched_d_ts_bug` diagnostic reports after `npm install -g @jackwener/opencli@latest` upgrades while preserving automatic repair across both paths.
- **OpenCLI 2.0.0 Adapter Sync (`opencli-adapter/events.js`)**:
  - Synchronized the 3-way merged OpenCLI 2.0.0 `events.js` (`browser: false`, `parseInt(..., 10)`, `resolveGregorianYearWithWeekday`, `upcoming_only`, and `status=1`) into `opencli-adapter/events.js`.

## [1.2.1] - 2026-10-15

### Added
- **Deterministic Year & Weekday Reconciliation (`src/parsers.js` & `opencli-adapter/events.js`)**:
  - Eliminated false future-year guessing on historical event cards (which omitted Gregorian years in Huodongxing search cards).
  - Mathematical weekday alignment (`周[日一二三四五六]`) resolves historical Gregorian years across a 5-year candidate window.
  - Title anchor extraction for historical year markers (`2022`, `2023`, etc.).
  - Explicit `isExpired` filtering in `filterRowsByDateRange`, `scoreAndRankRegionalEvents`, and `generateEcosystemDigest`.
  - Automatic `status=1` upstream query parameter when `upcomingOnly` is enabled so Huodongxing returns active upcoming events instead of expired historical listings.
- **Anti-WAF Tiered Self-Healing (`src/tunnel-fetch.js` & `src/direct-client.js`)**:
  - Integrated `ultra-low-cost-scraper` (`scraper_cli.py` `curl_cffi` Chrome 120 TLS fingerprint impersonation `--direct` first, followed by residential proxy tunnel fallback) when `DirectClient` encounters HTTP `403`/`429`/`503`, HTML WAF robot checks, or `301/302` Geetest redirects (`verify.huodongxing.com/gt3`), before falling back to `ego-browser` Geetest auto-unban.
- **Online Attendance & Remote Webinar Track (`src/ecosystem-digest.js` & `opencli-adapter/digest.js`)**:
  - Automatically isolates and flags all online/hybrid webinars (腾讯会议、视频号直播、双线接入) for remote operators, exposed via `hdx digest`, `GET /api/digest`, and `opencli huodongxing digest`.
- **Quad-City Radar Defaults (`深圳, 广州, 佛山, 上海`) & Web Console Historical Toggle (`#rec-include-past`)**:
  - Native cross-regional coverage across Greater Bay Area and Yangtze River Delta tech hubs, plus interactive `#rec-include-past` ("含历史活动") checkbox in the Web Console (`public/index.html`, `public/app.js`).
- **SDK `WatchlistStore` Class & CLI `watchlist archive/restore`**:
  - Exported `WatchlistStore` class and `archiveWatchlistItem` / `restoreWatchlistItem` helpers from `src/index.js` and added `hdx watchlist archive <id>` / `restore <id>` CLI subcommands.

### Fixed
- **OpenCLI Adapter Discovery & Dual-Resolution (`opencli-adapter/_shared.js` & `~/.opencli/clis/huodongxing`)**:
  - Replaced broken symlink with a real directory under `~/.opencli/clis/huodongxing/` and added dual-resolution (`../src/index.js` or `huodongxing-cli`) so `opencli validate huodongxing` discovers and validates all **15** commands with `0` errors and `0` warnings.
- **HTTP 413 Oversized Body Guard & Concurrent Watchlist Write Safety (`src/server.js`, `src/watchlist-store.js`, `src/ics.js`)**:
  - `readJsonBody` now returns a clean `413 PAYLOAD_TOO_LARGE` JSON response without resetting the client socket; `writeRawStore` uses unique per-write temporary filenames; and `parseTicketDateRange` supports explicit 4-digit years and Chinese date delimiters (`年/月/日`) across year boundaries.

## [1.2.0] - 2026-10-15

### Added
- **Ecosystem Intelligence Digest Engine (`src/ecosystem-digest.js` & `hdx digest`)**:
  - 5-track domain taxonomy (`ai_llm`, `cross_border_ecommerce`, `web3_fintech`, `hardware_robotics`, `developer_cloud`) with weighted keyword scoring, technical stack extraction, city heatmap aggregation across **佛山 · 广州 · 深圳**, and Markdown executive report generation.
- **Resilient Proxy / Tunnel Fetch Fallback (`src/tunnel-fetch.js`)**:
  - Automatic HTTP/HTTPS proxy & local browser bridge fallback when upstream OpenResty / Geetest v3 WAF challenges occur.
- **Deterministic Browser E2E Context Guard (`tests/e2e-ui.test.js`)**:
  - Added `safeWait` execution-context retry wrapper across `ego-browser` navigation and hard-reload checks (`17/17` unit + API + browser E2E tests passing with `0` console errors).

## [1.0.0] - 2026-10-14

### Added
- **Dual-Engine Architecture (`HuodongxingClient`)**:
  - `DirectClient`: Paced Node HTTP client with `HDXWAFID` cookie capture and WAF challenge detection.
  - `OpenCliClient`: Zero-CAPTCHA in-origin browser `fetch()` bridge via `opencli browser <session> eval`.
  - `auto` engine mode: Seamless routing and cookie bootstrap across all 12 functional areas of `huodongxing.com`.
- **Regional Recommendation Engine (`recommend` — 佛山 · 广州 · 深圳 Default)**:
  - Multi-city discovery and relevance ranking across **Foshan, Guangzhou, and Shenzhen (`佛山, 广州, 深圳` / `foshan, guangzhou, shenzhen`)** and region presets (`gba`, `gba-full`, `yrd`, `jjj`, `sw`) with bilingual city normalization, static promotional banner filtering, past-event filtering (`upcomingOnly`), and cross-city deduplication.
- **Persistent Watchlist CRUD (`src/watchlist-store.js` & `hdx watchlist`)**:
  - Server-side and CLI-backed watchlist (`~/.config/huodongxing-cli/watchlist.json`) supporting priority sorting, inline notes, soft-delete (`archived`) / restore (`saved`), permanent delete, and RFC 5545 `.ics` calendar export.
- **Interactive Web Console & Real-Time SSE Diagnostic Server (`src/server.js`, `public/`, `hdx serve`)**:
  - Zero-facade Web Console serving live regional recommendations (`#recommend`), persistent watchlist (`#watchlist`), ranklist/topics/organizers explorer (`#explore`), and unified `能读 / 能试 / 能调` diagnostic inspector (`#diagnose`) with SSE push (`/api/stream`) and design-system validation (`DESIGN.md`).
- **20 CLI Subcommands (`huodongxing` / `hdx`)**:
  - Public Discovery & Recommendations: `recommend`, `events`, `detail`, `organizers`, `ranklist`, `topics`.
  - Persistent Watchlist & Web Server: `watchlist` (`list`, `add`, `update`, `archive`, `restore`, `remove`, `export-ics`), `serve`.
  - Authenticated User Center: `status`, `timeline`, `tickets`, `ticket-detail`, `favorites`, `following`, `profile`, `profile-set`, `register`, `export-ics`.
  - Organizer Console: `console-home`, `console-events`.
  - Observability & Reconciler: `diagnose` (`--read-config`, `--sample`, `--set-config`, `--reset-config`, `--offline`).
- **Pre-Socket Security Route Denylist (`src/security-guard.js`)**:
  - Blocks account destruction, password/binding changes, event deletion, ticket cancellation/refund, and payment/cashier routes before socket creation.
- **RFC 5545 iCalendar Exporter (`src/ics.js`)**:
  - Converts registered Huodongxing electronic tickets, regional recommendations, and watchlist items into standard `.ics` calendar feeds with `Asia/Shanghai` (`UTC+8`) timezone normalization.
- **OpenCLI Adapter Suite (`opencli-adapter/`)**:
  - 14 SSOT-backed OpenCLI commands (`recommend`, `events`, `detail`, `tickets`, `timeline`, `favorites`, `following`, `profile`, `organizers`, `ranklist`, `topics`, `console-home`, `console-events`, `diagnose`).

### Fixed
- **Upstream OpenCLI `huodongxing/events.js` HTTP 500, City Alias & Promo Banner Bugs**:
  - Removed unconditional `d=ts` query parameter when `date` and `dateTo` are empty (preventing HTTP 500), added bilingual city/region normalization (`foshan,guangzhou,shenzhen` -> `佛山,广州,深圳`), and filtered static promotional banners lacking time and location.
