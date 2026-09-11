# Figma Guide — Step-by-Step Setup

> Build the FriendCore design file by hand, mirroring the token contract in [`design-system.md`](design-system.md).  
> **Rule:** Figma never invents values the code doesn't have. When in doubt, read `src/styles.scss`.

---

## Before you start

**What you need:**
- A free [Figma](https://figma.com) account (Starter tier is enough for solo work).
- This repo's [`design-system.md`](design-system.md) open beside Figma.
- ~2–4 hours for foundations; screens come after.

**What you'll produce:**
- One Figma file with pages, Variables, text styles, a component kit, screen mockups, and a prototype of the critical flows.

---

## Step 1 — Create the file and pages

1. In Figma, click **Design file** → name it **FriendCore Web Client**.
2. In the left sidebar (pages list), rename **Page 1** and add pages in this order:

| Page name | Purpose |
|---|---|
| `Cover` | Title, version, link to this repo |
| `Foundations` | Variables, swatches, type scale, grid |
| `Components` | Reusable UI kit |
| `Patterns` | Composed blocks (post card, nav, etc.) |
| `Screens` | Full screens (mobile + desktop frames) |
| `Flows / Prototype` | Linked flows for testing |
| `Archive` | Old explorations (keep the canvas clean) |

3. On **Cover**, add a frame with:
   - Title: **FriendCore Web Client**
   - Subtitle: *Design file — tokens mirror `src/styles.scss`*
   - Version: `v0.1`
   - Note: "Source of truth for tokens is code, not Figma."

---

## Step 2 — Set up the grid (Foundations page)

1. Go to **Foundations**.
2. Create a frame **Grid / Desktop** — width **1280px**, height auto.
3. Select the frame → right panel → **Layout grid** → **+**:
   - **Columns:** 12, margin 80, gutter 24, stretch.
4. Create a frame **Grid / Mobile** — width **390px**:
   - **Columns:** 4, margin 16, gutter 16.

These grids guide screen layout; components use the spacing tokens, not arbitrary pixels.

---

## Step 3 — Create Color Variables (the token mirror)

1. Open the **Local variables** panel (right sidebar, diamond icon, or `Shift + I` then Variables tab).
2. Click **+** → **Create collection** → name it **Color**.
3. Click the collection → **+** next to modes → add mode **Dark**. Rename the default mode to **Light**.

4. For each row in the Color table in [`design-system.md`](design-system.md) §2, click **Create variable** → type **Color**:

| Variable name | Light value | Dark value |
|---|---|---|
| `color/bg` | `#F7F7F8` | `#131419` |
| `color/surface` | `#FFFFFF` | `#1B1D24` |
| `color/surface-2` | `#F0F1F3` | `#23252E` |
| `color/border` | `#D9DBE0` | `#333642` |
| `color/text` | `#1C1D22` | `#E8E9EE` |
| `color/text-muted` | `#5C5F6A` | `#A0A3AF` |
| `color/accent` | `#4F6DF5` | `#8AA0FF` |
| `color/accent-contrast` | `#FFFFFF` | `#0E1016` |
| `color/danger` | `#C0392B` | `#C0392B` |
| `color/success` | `#1F8A4C` | `#1F8A4C` |
| `color/warning` | `#B06A00` | `#B06A00` |

5. Optional tint helpers (Figma-only): `color/success-tint`, `color/danger-tint` at ~16% opacity on transparent.

6. On **Foundations**, draw swatch rectangles bound to each variable (select rect → fill → bind to variable). Label each swatch. Duplicate the row and switch the frame to **Dark** mode to preview.

**Tip:** Use **Light** mode while designing; periodically toggle **Dark** to check contrast.

---

## Step 4 — Create Space Variables

1. **+** → **Create collection** → name **Space** (single mode, no Light/Dark).
2. Create variables of type **Number** (unit: px in Figma, maps to rem in code):

| Variable | Value (px) |
|---|---|
| `space/1` | 4 |
| `space/2` | 8 |
| `space/3` | 12 |
| `space/4` | 16 |
| `space/6` | 24 |
| `space/8` | 32 |
| `space/12` | 48 |

Use these for auto-layout **gap** and **padding** (bind via the variable icon on spacing fields).

---

## Step 5 — Create Radius Variables

Collection **Radius** (number, px):

| Variable | Value |
|---|---|
| `radius` | 10 |
| `radius/sm` | 6 |

Apply to corner radius on frames and components.

---

## Step 6 — Text styles

1. On **Foundations**, add a text box with **Inter** (or Segoe UI) — this is a mockup stand-in only.
2. Create four text styles (select text → right panel → **Style** icon → **+**):

| Style name | Size | Weight | Line height |
|---|---|---|---|
| `text/sm` | 14 | Regular (400) | 160% (1.6) |
| `text/base` | 16 | Regular (400) | 160% |
| `text/lg` | 20 | Semibold (600) | 160% |
| `text/xl` | 26 | Semibold (600) | 120% (headings) |

3. Add a **text/sm · muted** variant: same as `text/sm` but color bound to `color/text-muted`.

---

## Step 7 — Effect style (shadow)

1. Draw a card rectangle (fill `color/surface`, stroke `color/border`, radius `radius`).
2. Add **Drop shadow** (two layers to match code):

**Light mode:**
- Shadow 1: X 0, Y 1, Blur 2, Spread 0, `#141E1E` at 6%
- Shadow 2: X 0, Y 4, Blur 16, Spread 0, `#141E1E` at 5%

3. Save as effect style **`shadow/default`**.
4. For dark mode preview, duplicate the card in Dark mode and adjust to the dark shadow values from [`design-system.md`](design-system.md).

---

## Step 8 — Build primitive components (Components page)

Work **bottom-up**: atoms first, then molecules. Every component should:
- Use **auto-layout** (horizontal or vertical).
- Bind colors/spacing/radius to Variables (not hard-coded hex).
- Have **variants** for states (default, hover, disabled, loading where relevant).

### Minimum primitive set (build in this order)

| Component | Variants / states | Notes |
|---|---|---|
| `Button / Primary` | default, hover, disabled, loading | Fill `color/accent`, text `color/accent-contrast`, padding `space/2` `space/4`, radius `radius/sm` |
| `Button / Secondary` | default, hover, disabled | Stroke `color/border`, fill `color/surface` |
| `Button / Danger` | default, hover, disabled | Fill `color/danger` |
| `IconButton` | default, hover | 40×40 min touch target |
| `TextField` | empty, filled, error, disabled | Label above field (persistent), helper text below |
| `TextArea` | same as TextField | Min height ~96px |
| `Toggle` | on, off, disabled | |
| `Checkbox` | unchecked, checked, indeterminate | |
| `Tag / Chip` | default, selected, removable | Radius 999 (pill) |
| `Avatar` | sm (32), md (40), lg (64) | Circle, fallback initials |
| `Card` | default, interactive (hover) | `color/surface`, `shadow/default`, padding `space/6` |
| `Pill / Badge` | neutral, success, danger, warning | Use tint helpers |
| `Spinner` | — | Simple rotating arc, `color/accent` |
| `Skeleton` | text line, rect, circle | `color/surface-2`, no animation in static mockups |
| `EmptyState` | — | Icon + heading + body + optional CTA |
| `Toast` | info, success, error | Bottom or top, non-blocking |
| `Modal` | — | Overlay 50% black + centered card |
| `Sheet` | — | Mobile bottom sheet variant |

**How to create variants in Figma:**
1. Select the component → right panel → **Create component** (or `Ctrl/Cmd + Alt + K`).
2. Click **Add variant** in the purple property row.
3. Name the property `State` with values `Default`, `Hover`, `Disabled`, etc.

**Focus state:** Add a `Focus` variant with a 2px `color/accent` stroke outside the component (simulates `:focus-visible`).

---

## Step 9 — Build pattern components (Patterns page)

Compose primitives into domain blocks. These map 1:1 to Angular components later.

| Pattern | Key elements |
|---|---|
| `PostCard` | Avatar, author, timestamp, text, media slot, like/comment actions |
| `PostComposer` | TextArea, attach button, sensitivity toggles, submit |
| `MediaUploader` | Drop zone, progress bar, status text (Processing / Ready / Failed) |
| `MediaViewer / SafePlaceholder` | Warning icon, explanation, "Show media" button (no image loaded) |
| `UserCard` | Avatar, name, username, tag chips, follow button |
| `ConversationRow` | Avatar, name, preview, timestamp, unread dot |
| `MessageBubble` | Sent (accent) vs received (surface-2), timestamp |
| `NotificationRow` | Icon by type, text, timestamp, unread indicator |
| `AppShell / Desktop` | Top bar + left nav + main column (672px max) |
| `AppShell / Mobile` | Top bar + content + bottom tabs |
| `ReportDialog` | Radio list of 9 categories + optional note + submit |

Place each pattern on the **Patterns** page; keep them as components for reuse on **Screens**.

---

## Step 10 — Design screens (Screens page)

For every screen in [`screens.md`](screens.md):
1. Create two frames: **390×844** (mobile) and **1280×900** (desktop).
2. Name frames: `Screen / {Name} / Mobile` and `Screen / {Name} / Desktop`.
3. Design **every required state** (loading, empty, error, success) as separate frames or variant sets.

Apply Variables throughout — no rogue hex codes.

---

## Step 11 — Prototype critical flows (Flows page)

Link frames with **Prototype** connections (select frame → Prototype tab → drag arrow).

**Minimum flows to prototype:**

1. **Register → verify email → onboarding (tags → suggested follows) → home feed**
2. **Login → home feed → compose post → upload media → poll → publish**
3. **Discovery → profile → follow**
4. **Messages → open thread → send → receive (simulate with second frame)**
5. **Profile (other user) → block (with confirm if following)**
6. **Settings → preferences toggles**

Use **Instant** or **Smart animate (200ms)** transitions. Avoid flashy transitions — match `--fc-motion`.

---

## Step 12 — Dev Mode handoff (Figma → Angular)

When implementing a screen in code:

1. Open the frame in **Dev Mode** (toggle top-right, or share link with Dev Mode).
2. Inspect spacing, sizes, and colors — verify they match Variables (if Dev Mode shows raw hex, cross-check the variable name).
3. In Angular component SCSS, use **`var(--fc-*)`** — never copy hex from Figma unless it's a one-off not yet tokenized (then add the token to code first).
4. Compare side-by-side in the browser at `http://localhost:3000`.

**Handoff checklist per screen:**
- [ ] All colors map to `--fc-*` tokens
- [ ] Spacing uses `--fc-space-*` steps only
- [ ] Typography uses `--fc-text-*` sizes
- [ ] Focus states implemented (`:focus-visible`)
- [ ] Empty / loading / error states built (not just happy path)
- [ ] Mobile and desktop layouts tested at 390px and 1280px

---

## Step 13 — Keeping Figma in sync (manual mirror discipline)

When you change a design decision:

```
1. Edit src/styles.scss          (source of truth)
2. Edit docs/design/design-system.md
3. Update matching Figma Variable / text style
4. Update affected components & screens
5. Add a row to design-system.md §11 Change log
```

**Weekly sanity check (5 min):** Spot-check 3 random components — do their fills/spacing still bind to Variables?

---

## Known caveats (mockups vs production)

| Topic | Figma | Production |
|---|---|---|
| Font | Inter / Segoe UI stand-in | System font stack (no web font) |
| Dark mode | Variable mode toggle | `prefers-color-scheme` + future `[data-theme]` |
| Pill tints | Manual 16% opacity | `color-mix()` in SCSS |
| Motion | Prototype transitions | CSS transitions; zeroed when reduced-motion |
| Shadows | Effect style | Removed when `data-reduce-visual-noise="true"` |
| Media safety | Static placeholder frame | Real placeholder — image NOT loaded until consent |

---

## Keyboard shortcuts (handy)

| Action | Shortcut |
|---|---|
| Create component | `Ctrl/Cmd + Alt + K` |
| Detach instance | `Ctrl/Cmd + Alt + B` |
| Toggle layout grid | `Ctrl/Cmd + G` (with frame selected) |
| Local variables panel | Right sidebar → Variables |
| Dev Mode | Top bar toggle |

---

## Next steps

- Component specs: [`components.md`](components.md)
- Screen inventory: [`screens.md`](screens.md)
- Copy & accessibility rules: [`content-and-a11y.md`](content-and-a11y.md)
