# Huodongxing (活动行) Platform Capability Map & Visual Evidence

> **SSOT Pointer**: Machine-readable contract is stored in [`evidence/capability_map.json`](evidence/capability_map.json). All 12 functional areas were probed, sanitized of PII (`DemoUser`, `138****0000`, `demo@example.com`), and captured from the live rendered application.

## 1. Visual Reconnaissance Matrix (12 Functional Areas)

| # | Functional Area | Route / Endpoint | CLI Subcommand (`huodongxing` / `hdx`) | OpenCLI Adapter Command | Visual Evidence |
|---|---|---|---|---|---|
| 01 | **Home Portal & Featured Events** | `GET /` | `hdx events --city 全部 --limit 20` | `opencli huodongxing events` | ![01](evidence/screenshots/01_home_portal.png) |
| 02 | **Event Discovery & Search** | `GET /events?orderby={o\|n\|v\|r}&city={city}&tag={tag}&eventType={1\|2}&qs={kw}` | `hdx events --keyword AI --city 深圳` | `opencli huodongxing events --qs AI --city 深圳` | ![02](evidence/screenshots/02_events_search.png) |
| 03 | **Event Detail, Ticket Tiers & Form Schema** | `GET /event/{eventId}` | `hdx detail <eventId>` | `opencli huodongxing detail --id <eventId>` | ![03](evidence/screenshots/03_event_detail.png) |
| 04 | **Featured Organizers Directory (主办方)** | `GET /zhubanfang?tag={tag}` | `hdx organizers --limit 20` | `opencli huodongxing organizers --limit 20` | ![04](evidence/screenshots/04_organizers_directory.png) |
| 05 | **Popularity & Heat Ranklist (优选榜单)** | `GET /ranklist` | `hdx ranklist --limit 20` | `opencli huodongxing ranklist --limit 20` | ![05](evidence/screenshots/05_popularity_ranklist.png) |
| 06 | **Curated Special Topics (精选专题)** | `GET /topic` | `hdx topics --limit 20` | `opencli huodongxing topics --limit 20` | ![06](evidence/screenshots/06_special_topics.png) |
| 07 | **Personal Center & Activity Timeline** | `GET /user/index` & `GET /user/followandregevents?page=1&pagesize=10` | `hdx timeline --page 1` | `opencli huodongxing timeline --page 1` | ![07](evidence/screenshots/07_user_index_timeline.png) |
| 08 | **My Tickets & Electronic Passes** | `GET /user/regevents` & `GET /user/tikcets?tids={tid}` | `hdx tickets --status valid` / `hdx ticket-detail <tid>` / `hdx export-ics` | `opencli huodongxing tickets --status valid` | ![08](evidence/screenshots/08_user_tickets_regevents.png) |
| 09 | **Saved Events & Followed Organizers** | `GET /user/userfollows` | `hdx favorites` / `hdx following` | `opencli huodongxing favorites` / `following` | ![09](evidence/screenshots/09_user_follows_favorites.png) |
| 10 | **Account Profile & Reversible Bio Config** | `GET /account/profile` & `POST /profile` | `hdx profile` / `hdx profile-set --brief "..." --dry-run` | `opencli huodongxing profile` / `profile-set` | ![10](evidence/screenshots/10_account_profile.png) |
| 11 | **Organizer Console Dashboard (主办方首页)** | `GET /console/home` | `hdx console-home` | `opencli huodongxing console-home` | ![11](evidence/screenshots/11_console_home.png) |
| 12 | **Organizer Event Administration (活动管理)** | `GET /console/eventadmin` & `POST /console/userpubevents` | `hdx console-events --status all` | `opencli huodongxing console-events --status all` | ![12](evidence/screenshots/12_console_eventadmin.png) |

---

## 2. Reverse-Engineered Platform Contracts & Gotchas

### 2.1 Upstream OpenCLI Bug Repaired (`d=ts` HTTP 500)
- **Root Cause**: The upstream `opencli huodongxing events` adapter previously appended `d=ts` unconditionally in `buildEventsUrl()` even when `date` and `dateTo` were empty. Huodongxing's backend throws an unhandled exception (`HTTP 500`) when `d=ts` is sent without a date range.
- **Fix Applied**: `d=ts` is now emitted strictly when `date` or `dateTo` is non-empty.

### 2.2 OpenResty WAF & Geetest v3 Rate-Limit Envelope
- **Gateway**: OpenResty + Geetest v3 (`https://verify.huodongxing.com/gt3`).
- **Session Cookies**: `HDXWAFID` (client fingerprint cookie), `uid`, and `AccupassWeb` (encrypted ASP.NET forms authentication ticket).
- **Rate-Limit Threshold**: Firing `> 8` unpaced requests within a 20-second window triggers a temporary `302` redirect to `verify.huodongxing.com/gt3`.
- **Mitigation**: `src/security-guard.js` enforces a deterministic token-bucket pacer (`minIntervalMs: 900`, `concurrency: 1`) and `redirect: 'manual'` detection so automated runs remain 100% below the WAF threshold.

### 2.3 Backend Typos & Inline State Objects (SSOT)
- **`var ativityJson`** *(backend typo on `/event/<id>`, missing `c`)*: Full event metadata (`Id`, `Title`, `Start`, `End`, `City`, `Address`, `Tag`, `Organizers`, `Setting`, `IsFree`).
- **`var eventTicketsJson` & `var formItemsJson`**: Ticket tiers (`SN`, `Title`, `Price`, `PriceStr`, `NeedApply`, `StatusStr`) and custom registration form schema (`Key`, `Type`, `Required`, `Title`, `Subitems`).
- **`/user/tikcets?tids=<tid>`** *(backend typo on order detail route: `tikcets`, not `tickets`)*: Order detail view, while `<textarea id="ticket_print_span_*">` inside `/user/regevents` embeds full QR code URLs, 13-digit ticket numbers, venue addresses, and refund tokens.
- **`var currentUser` (`/console/home`) vs `var currenUser` (`/console/eventadmin`)**: Organizer console state objects (note `currenUser` missing `t` on `/console/eventadmin`).
- **REA AST Static Analysis (`hdx-new-admin.js` & `hdx-message-center.js`)**: Verified via `rea analyze-javascript-application` — message center polling reads `localStorage.getItem('appToken')` and `localStorage.getItem('appId')` against `/api/v2/message/*`.
