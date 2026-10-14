# Changelog

All notable changes to `huodongxing-cli` are documented in this file.

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
