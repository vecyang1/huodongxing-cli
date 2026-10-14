# Changelog

All notable changes to `huodongxing-cli` are documented in this file.

## [1.0.0] - 2026-10-14

### Added
- **Dual-Engine Architecture (`HuodongxingClient`)**:
  - `DirectClient`: Paced Node HTTP client with `HDXWAFID` cookie capture and WAF challenge detection.
  - `OpenCliClient`: Zero-CAPTCHA in-origin browser `fetch()` bridge via `opencli browser <session> eval`.
  - `auto` engine mode: Seamless routing and cookie bootstrap across all 12 functional areas of `huodongxing.com`.
- **18 CLI Subcommands (`huodongxing` / `hdx`)**:
  - Public Discovery: `events`, `detail`, `organizers`, `ranklist`, `topics`.
  - Authenticated User Center: `status`, `timeline`, `tickets`, `ticket-detail`, `favorites`, `following`, `profile`, `profile-set`, `register`, `export-ics`.
  - Organizer Console: `console-home`, `console-events`.
  - Observability & Reconciler: `diagnose` (`--read-config`, `--sample`, `--set-config`, `--reset-config`, `--offline`).
- **Pre-Socket Security Route Denylist (`src/security-guard.js`)**:
  - Blocks account destruction, password/binding changes, event deletion, ticket cancellation/refund, and payment/cashier routes before socket creation.
- **RFC 5545 iCalendar Exporter (`src/ics.js`)**:
  - Converts registered Huodongxing electronic tickets into standard `.ics` calendar feeds with `Asia/Shanghai` (`UTC+8`) timezone normalization.
- **OpenCLI Adapter Suite (`opencli-adapter/`)**:
  - 12 SSOT-backed OpenCLI commands (`detail`, `tickets`, `timeline`, `favorites`, `following`, `profile`, `organizers`, `ranklist`, `topics`, `console-home`, `console-events`, `diagnose`) plus upstream `events` owner fix.

### Fixed
- **Upstream OpenCLI `huodongxing/events.js` HTTP 500 Bug**:
  - Removed unconditional `d=ts` query parameter when `date` and `dateTo` are empty, preventing Huodongxing's C# backend from throwing HTTP 500.
