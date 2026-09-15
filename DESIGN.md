---
name: Gestor Pessoal
colors:
  surface: '#111319'
  surface-dim: '#111319'
  surface-bright: '#373940'
  surface-container-lowest: '#0c0e14'
  surface-container-low: '#191b22'
  surface-container: '#1d1f26'
  surface-container-high: '#282a30'
  surface-container-highest: '#33353b'
  on-surface: '#e2e2ea'
  on-surface-variant: '#dac2b8'
  inverse-surface: '#e2e2ea'
  inverse-on-surface: '#2e3037'
  outline: '#a28c83'
  outline-variant: '#54433c'
  surface-tint: '#ffb694'
  primary: '#ffb694'
  on-primary: '#571f00'
  primary-container: '#a45832'
  on-primary-container: '#ffebe4'
  inverse-primary: '#934a26'
  secondary: '#9dd2b5'
  on-secondary: '#003824'
  secondary-container: '#1d5039'
  on-secondary-container: '#8cc0a4'
  tertiary: '#ffb4aa'
  on-tertiary: '#630f0c'
  tertiary-container: '#b44b41'
  on-tertiary-container: '#ffebe8'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdbcc'
  primary-fixed-dim: '#ffb694'
  on-primary-fixed: '#351000'
  on-primary-fixed-variant: '#753410'
  secondary-fixed: '#b9efd0'
  secondary-fixed-dim: '#9dd2b5'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#1d5039'
  tertiary-fixed: '#ffdad5'
  tertiary-fixed-dim: '#ffb4aa'
  on-tertiary-fixed: '#410001'
  on-tertiary-fixed-variant: '#82261f'
  background: '#111319'
  on-background: '#e2e2ea'
  surface-variant: '#33353b'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 1.375rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.625rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '500'
    lineHeight: 1.375rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.5rem
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.25rem
  label-lg:
    fontFamily: Space Mono
    fontSize: 0.875rem
    fontWeight: '700'
    lineHeight: 1.25rem
    letterSpacing: 0.02em
  label-md:
    fontFamily: Space Mono
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Space Mono
    fontSize: 0.6875rem
    fontWeight: '400'
    lineHeight: 0.875rem
    letterSpacing: 0.03em
  data-metric:
    fontFamily: Space Mono
    fontSize: 1.5rem
    fontWeight: '700'
    lineHeight: 1.75rem
    letterSpacing: -0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.25rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system is built for quiet, singular operational clarity. It discards corporate theater—banishing simulated server metrics, mock ping latencies, build hashes, meaningless SLA counters, and decorative marketing badges—in favor of an unadorned, high-efficiency personal cockpit for multi-store e-commerce management.

The visual direction combines strict minimalism with utilitarian discipline:
- **Tone:** Focused, calm, understated, and industrial. Every pixel must serve inventory balance, logistics tracking, or net margin comprehension.
- **Form Follows Function:** Dense information hierarchy using subtle micro-surfaces and muted tonal layers rather than loud visual indicators.
- **Clarity over Flash:** Zero synthetic glow, glossy gradients, or distracting animations. State changes are crisp and immediate.

## Colors

The palette relies on a deep matte graphite foundation paired with desaturated earthy accents that convey financial realism and tactile composure.

### Canvas & Surface Hierarchy
- **Base Background:** `#14161C` (deep matte graphite, non-textured).
- **Surface Level 1:** `#1C1F27` (structural surfaces: sidebar, top navigation, main container cards).
- **Surface Level 2:** `#22262F` (interactive and layered elements: input fields, select dropdowns, contextual action sheets, modal drawers).
- **Surface Level 3 / Active State:** `#2A2E38` (hover states, subtle active rows, pressed cards).
- **Border / Divider:** `#2A2E38` (precise 1px structural boundaries; completely flat with no exterior glow or drop shadow).

### Typography Contrast
- **Primary Text:** `#EDE8DE` (warm bone-white; high legibility for critical data points, titles, and active labels).
- **Secondary Text:** `#9A9CA6` (cool muted slate; table headers, contextual descriptions, supporting metrics).
- **Tertiary Text:** `#6B6D78` (de-emphasized graphite; timestamps, inactive state hints, keyboard shortcut indicators).

### Functional Accents
- **Primary Accent (`#A45832`):** Matte oxidized copper. Strictly metered: reserved for active navigation indicators, definitive primary actions (e.g., "Confirm Dispatch"), and exactly one primary hero metric per screen.
- **Positive / Inflows (`#6FA287`):** Sage green. Applied to incoming cash flows, replenished stock levels, and completed order statuses.
- **Negative / Outflows / Alerts (`#C1554A`):** Matte terracotta. Applied to stock exhaustion warnings, margin deficits, return charges, and cancellation states.

## Typography

The typographic strategy balances natural user interface fluidity with mechanical precision:

- **Inter** handles interface communication, labels, prose, and navigation items. It is tuned for legibility in dense operational views with tight horizontal tracking.
- **Space Mono** governs all numerical representations, currency amounts (R$), dates, SKUs, inventory tallies, and barcode IDs. Monospaced rendering ensures absolute column alignment across tables and metric cards, preventing visual jitter during dynamic value updates.
- Tabular data must always employ standard numerical alignment: labels left-aligned, numbers right-aligned, and status pills centered.

## Layout & Spacing

The layout is constructed on an unbroken structural grid that favors information density over ornamental whitespace.

### Structural Framework
- **Master Shell:** Fixed 240px utility sidebar on the left, top utility header (52px height) pinned, and a fluid main viewport.
- **Desktop Grid:** 12-column fluid grid system with `gutter-desktop` (1.25rem / 20px) and outer `margin-desktop` (1.5rem / 24px).
- **Tablet / Small Desktop (768px - 1024px):** Sidebar collapses into an icon rail (56px width); grid transitions to 8 columns with 1rem gutters.
- **Mobile (< 768px):** Single-column stack, outer canvas margin compressed to 1rem (16px). Data tables become horizontally swipeable or break into itemized key-value list cards.

### Spacing Principles
- Density is prioritized: compact component padding (`space-xs` and `space-sm`) keeps rows clean and lists immediately glanceable without excessive vertical scrolling.
- Structural cards use internal padding of `space-md` (12px) or `space-lg` (20px) strictly based on contents.

## Elevation & Depth

This system avoids ambient shadows, colored glows, and blurred glassmorphism. Depth is achieved exclusively through **tonal planar stepping** and **1px architectural line borders**.

- **Level 0 (App Canvas):** `#14161C`. Flat, unadorned baseline.
- **Level 1 (Structural Modules):** `#1C1F27` outlined with a solid `1px solid #2A2E38` border. No drop shadows.
- **Level 2 (Active Overlays & Sub-panels):** `#22262F` framed with `1px solid #2A2E38`. When acting as dropdowns or popovers, a pure black hairline perimeter cast (`0 4px 16px rgba(0, 0, 0, 0.45)`) may be used purely for separation against adjacent content, devoid of accent tinting.
- **Focus Rings & Hover:** Rather than heavy shadows, hovered interactive items transition their background toward `#2A2E38` or outline border toward `#6B6D78`.

## Shapes

The design system enforces a disciplined geometric standard:

- **Radius Tier (`roundedness: 1`):** Default corners are set strictly to `4px` (`0.25rem`). This subtle rounding softens sharp edges without compromising the compact, technical feel of data tables.
- **Cards, Drawers, Inputs, and Modals:** Inherit `4px` radius throughout.
- **Micro-Indicators:** System badges and status dots use `2px` or sharp geometries. Circular shapes are strictly limited to pure 1:1 indicator pills (e.g., presence indicators) and store avatar monograms.

## Components

### Header (Unified Control Bar)
- Stripped of all decorative indicators. Contains:
  1. Store context switcher (Loja 1 / Loja 2 / Visão Consolidada).
  2. Plain-text sync status badge: `#6FA287` 6px dot with label "Sincronizado" and human-readable time (e.g., "há 4 min").
  3. Integrated search trigger: simple bar displaying `⌘K` in tertiary text (`#6B6D78`).
  4. Current date formatted in `Space Mono`.

### Buttons
- **Primary Button:** Background `#A45832`, foreground `#EDE8DE`, 4px radius, 0 12px horizontal padding, 32px height. No gradient, no glow. Hover shifts to `#A95C35`.
- **Secondary / Ghost Button:** Background transparent, border `1px solid #2A2E38`, foreground `#EDE8DE`. Hover background `#22262F`.
- **Destructive Button:** Background transparent, border `1px solid #C1554A`, foreground `#C1554A`. Hover background `rgba(193, 85, 74, 0.1)`.

### Data Cards & Single Hero Metric
- Card background `#1C1F27`, border `1px solid #2A2E38`, padding `1.25rem`.
- Only one hero metric per display uses `#A45832` for primary numerical accent. All other metrics use `#EDE8DE` with small functional indicators in sage (`#6FA287`) or terracotta (`#C1554A`) to denote trajectory.

### Input Fields & Controls
- Base background `#22262F`, border `1px solid #2A2E38`, height 32px, text `#EDE8DE`, placeholder `#6B6D78`.
- Focus state: border shifts to `#9A9CA6` with 0 outline ring.
- Checkboxes: 14px square, 2px radius, background `#14161C`, border `1px solid #2A2E38`. Checked state fills `#A45832` with `#EDE8DE` icon mark.

### Data Tables (Orders, Stock, Cash Flow)
- Headers: `#1C1F27` background, uppercase `0.6875rem` label typography in `#9A9CA6`, border-bottom `1px solid #2A2E38`.
- Rows: 36px height, alternating background transparent and subtle `#1C1F27`, bottom divider `1px solid #2A2E38`.
- SKU and financial values rendered in `Space Mono` for strict tabular grid scanning.

### Status Chips
- Pill-free, low-profile badges: background `#22262F`, border `1px solid #2A2E38`, padding `2px 6px`, text `Space Mono` 11px.
- Positive state adds a left-side 4px dot in `#6FA287`; warning/alert adds a 4px dot in `#C1554A`.
