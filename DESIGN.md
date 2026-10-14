---
name: Huodongxing Regional Intelligence & Diagnostic Console
colors:
  surface: '#fbf9f9'
  surface-container: '#efeded'
  on-surface: '#1b1c1c'
  on-surface-variant: '#4f4537'
  primary: '#7e5700'
  on-primary: '#ffffff'
  primary-container: '#c8963e'
  secondary: '#635e54'
  tertiary: '#5f5e5e'
  background: '#fbf9f9'
  outline: '#817565'
typography:
  headline-h1:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  body-std:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  full: 9999px
spacing:
  max-width: 1280px
  section-pad-y-desktop: 2.5rem
  section-pad-y-mobile: 1.25rem
  component-gap: 1.5rem
---

## Brand & Style

**Huodongxing Regional Intelligence & Diagnostic Console (`huodongxing-cli`)** adopts an **Editorial Intelligence & Precision Operator** aesthetic: warm ivory paper surfaces (`#fbf9f9`), high-contrast ink typography (`#1b1c1c`), amber-gold regional priority badges (`#7e5700` / `#c8963e`), and semantic emerald/crimson telemetry pills for pre-socket security and live diagnostic reconciliation.

Single-surface mode (`Light Editorial Console`) is used across all four hash routes (`#recommend`, `#watchlist`, `#explore`, `#diagnose`) so operators have consistent high-contrast readability across desktop (`1440×900`) and mobile (`390×844`) viewports.

## Colors

- **Background & Surface (`#fbf9f9`)**: Primary canvas background and card surface for clean editorial legibility.
- **Surface Container (`#efeded`)**: Filter bars, secondary panels, diagnostic code blocks, and table headers.
- **On-Surface (`#1b1c1c`) & On-Surface Variant (`#4f4537`)**: High-contrast primary titles and secondary metadata (timestamps, venues, organizers).
- **Primary (`#7e5700`) & Primary Container (`#c8963e`)**: Active regional tabs (`佛山 · 广州 · 深圳`), primary CTA buttons, and recommendation score indicators.
- **Semantic Status Tokens**:
  - Allowed / Verified: `#15803d` on `#dcfce7`
  - Blocked / Error: `#b91c1c` on `#fee2e2`
  - City Badges: Foshan (`#7e5700`), Guangzhou (`#1d4ed8`), Shenzhen (`#047857`)

## Typography

- **Primary Sans (`Inter`, `-apple-system`, `"PingFang SC"`, `"Microsoft YaHei"`, `sans-serif`)**: Clean geometric rhythm for bilingual Chinese/English event titles, city badges, and structured forms.
- **Monospace (`"JetBrains Mono"`, `"SFMono-Regular"`, `monospace`)**: Event IDs (`2871552596500`), route patterns, security rule IDs, and JSON diagnostic payloads.

## Layout & Spacing

- **Max Width**: `1280px` centered container with responsive horizontal padding (`1.5rem` desktop, `1rem` mobile).
- **Grid System**: Responsive CSS Grid (`repeat(auto-fill, minmax(340px, 1fr))` on desktop, single-column `1fr` on mobile viewports `< 640px`).
- **Sticky Header & Navigation**: Top status bar + 4 route tabs (`#recommend`, `#watchlist`, `#explore`, `#diagnose`) remain accessible without obscuring content.

## Components

### Buttons
- **Primary**: Solid `#7e5700` background with `#ffffff` text, `0.5rem` border-radius, subtle hover elevation, and disabled state during in-flight API calls.
- **Secondary**: `#efeded` surface container with `#1b1c1c` text and `1px solid` subtle border.
- **Danger / Archive**: Soft crimson outline for watchlist archiving or config reset.

### Cards & Containers
- **Event Recommendation Card**: Displays rank badge, matched city pill (`佛山` / `广州` / `深圳`), recommendation score breakdown, matched theme tags, time/venue/organizer metadata, and 3 real actions: Inspect Detail Modal, Save/Remove Watchlist, and Download `.ics`.
- **Diagnostic Panel (`能读 / 能试 / 能调`)**: Three-column structured inspector displaying live config sources, interactive sample classifier, and persistent operator config editor.

### Inputs
- High-contrast `1px solid #817565` border, `0.5rem` radius, focus ring (`2px solid #7e5700`), and explicit inline validation feedback.

## Do's and Don'ts

### Do
- Derive every UI badge, event list, watchlist item, and configuration value from authoritative server API responses (`/api/*`).
- Re-fetch server state after every mutation (`POST` / `PATCH` / `DELETE`) before updating the UI.
- Support full keyboard and mobile viewport (`390×844`) interaction.

### Don't
- Never use `setTimeout` to simulate network calls or hardcode static demo arrays in UI components.
- Never leave dead `onClick` handlers or placeholder `alert()` / `Coming soon` toasts.
