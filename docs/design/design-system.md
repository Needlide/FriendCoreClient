# FriendCore Design System — Token Contract

> **Source of truth:** [`src/styles.scss`](../../src/styles.scss)  
> **Figma mirror:** manual 1:1 copy into Figma Variables (see [`figma-guide.md`](figma-guide.md))  
> **When a value changes:** edit `src/styles.scss` → update this doc → update Figma.

All tokens use the `--fc-*` prefix in code. In Figma, drop the `--fc-` prefix and use slash groups (e.g. `--fc-accent` → `color/accent`).

---

## 1. Philosophy (brief)

- **Calm, content-first** — low-saturation palette, one accent, generous whitespace.
- **Privacy-first** — system font stack only; no third-party font CDN.
- **Accessibility-first** — tokens encode user preferences from the API (`UserPreferences`).

---

## 2. Color tokens

Collection **Color** in Figma with two modes: **Light** (default) and **Dark**.

| CSS variable | Figma variable | Light (`:root`) | Dark (`prefers-color-scheme: dark`) | Usage |
|---|---|---|---|---|
| `--fc-bg` | `color/bg` | `#f7f7f8` | `#131419` | Page background |
| `--fc-surface` | `color/surface` | `#ffffff` | `#1b1d24` | Cards, panels, modals |
| `--fc-surface-2` | `color/surface-2` | `#f0f1f3` | `#23252e` | Subtle fills, code blocks, pills |
| `--fc-border` | `color/border` | `#d9dbe0` | `#333642` | Borders, dividers |
| `--fc-text` | `color/text` | `#1c1d22` | `#e8e9ee` | Primary text |
| `--fc-text-muted` | `color/text-muted` | `#5c5f6a` | `#a0a3af` | Secondary text, labels |
| `--fc-accent` | `color/accent` | `#4257e6` | `#8aa0ff` | Links, primary buttons, focus ring |
| `--fc-accent-contrast` | `color/accent-contrast` | `#ffffff` | `#0e1016` | Text on accent backgrounds |
| `--fc-danger` | `color/danger` | `#c0392b` | `#e06c5b` | Errors, destructive actions |
| `--fc-success` | `color/success` | `#1c7d44` | `#4caf7d` | Success states |
| `--fc-warning` | `color/warning` | `#9a5d00` | `#d69a3d` | Warnings, caution |

> Contrast (WCAG 1.4.3, verified by script Sep 2026): text/muted ≥ 6.3 on both
> surfaces in both modes; white-on-accent 5.6 (light) / dark-on-accent 7.7;
> danger/success/warning ≥ 5.1 everywhere. Dark-mode status colors are lighter
> tints — do not reuse the light hexes on dark surfaces (they fail at ~3–3.9).

**Semantic tints (Figma-only helpers):** The app uses `color-mix()` for pill backgrounds (e.g. success/danger at 16% opacity). Figma cannot compute this — define optional helper variables:

| Figma variable | Approx. value (light) | Usage |
|---|---|---|
| `color/success-tint` | `#1f8a4c` at 16% on transparent | Success pill background |
| `color/danger-tint` | `#c0392b` at 16% on transparent | Error pill background |

Do **not** add these to CSS unless you replace the `color-mix()` calls with explicit tokens.

---

## 3. Typography tokens

| CSS variable | Figma text style | Value | px equivalent (16px root) |
|---|---|---|---|
| `--fc-font-sans` | *(font family)* | `system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif` | — |
| `--fc-font-mono` | *(font family)* | `ui-monospace, 'SFMono-Regular', 'Cascadia Code', Menlo, Consolas, monospace` | — |
| `--fc-text-sm` | `text/sm` | `0.875rem` | 14px |
| `--fc-text-base` | `text/base` | `1rem` | 16px |
| `--fc-text-lg` | `text/lg` | `1.25rem` | 20px |
| `--fc-text-xl` | `text/xl` | `1.625rem` | 26px |
| `--fc-line` | *(line height on all text styles)* | `1.6` | — |

**Figma font stand-in:** Use **Inter** or **Segoe UI** in Figma mockups. Production ships the system stack — mockups will look slightly different and that is intentional.

**Line length:** Main text columns should not exceed `--fc-content-max` (42rem ≈ 672px at 16px root ≈ 60–70 characters per line).

---

## 4. Spacing tokens (8px base)

Collection **Space** in Figma (type: number, unit: px).

| CSS variable | Figma variable | rem | px |
|---|---|---|---|
| `--fc-space-1` | `space/1` | `0.25rem` | 4 |
| `--fc-space-2` | `space/2` | `0.5rem` | 8 |
| `--fc-space-3` | `space/3` | `0.75rem` | 12 |
| `--fc-space-4` | `space/4` | `1rem` | 16 |
| `--fc-space-6` | `space/6` | `1.5rem` | 24 |
| `--fc-space-8` | `space/8` | `2rem` | 32 |
| `--fc-space-12` | `space/12` | `3rem` | 48 |

Use these for padding, gaps (auto-layout), and margins. Do not invent intermediate values (e.g. 10px, 18px) unless you add a matching token to code first.

---

## 5. Shape & depth tokens

| CSS variable | Figma variable | Value |
|---|---|---|
| `--fc-radius` | `radius` | `0.625rem` (10px) |
| `--fc-radius-sm` | `radius/sm` | `0.375rem` (6px) |
| `--fc-shadow` | effect style `shadow/default` | Light: `0 1px 2px rgba(20,22,30,0.06), 0 4px 16px rgba(20,22,30,0.05)` |
| | | Dark: `0 1px 2px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.35)` |

**Reduced visual noise:** When `[data-reduce-visual-noise="true"]` is set on `<html>`, `--fc-shadow` becomes `none`. Design a flat variant of elevated surfaces for this mode.

---

## 6. Motion tokens

| CSS variable | Figma *(document only)* | Value |
|---|---|---|
| `--fc-motion-fast` | — | `120ms` |
| `--fc-motion` | — | `200ms` |
| `--fc-ease` | — | `cubic-bezier(0.2, 0, 0, 1)` |

Figma prototypes may use “Smart animate” with ~200ms ease-out. These tokens are **zeroed out** when:
- OS `prefers-reduced-motion: reduce`, or
- `[data-reduce-motion="true"]` on `<html>` (from `UserPreferences.ReduceMotion`).

Do not design motion that is essential to understanding — it must degrade gracefully to instant state changes.

---

## 7. Layout tokens

| CSS variable | Figma frame width | Value |
|---|---|---|
| `--fc-content-max` | Main column frame | `42rem` (672px) |

### Breakpoints (convention — not yet in CSS)

Use these frame widths in Figma. Implement with standard media queries when building components.

| Name | Min width | Frame width | Layout |
|---|---|---|---|
| `mobile` | — | 390px | Bottom tab bar, single column |
| `tablet` | 768px | 768px | Optional side nav collapse |
| `desktop` | 1024px | 1280px | Left nav + main column (max 672px) + optional context column |

---

## 8. Accessibility hooks (HTML attributes)

Set on `<html>` by `PreferencesService` (`src/app/core/preferences/preferences.service.ts`,
loaded by the shell; safe defaults apply until the first load) from
`GET /users/me/preferences`:

| Attribute | API field | Effect on tokens / UI |
|---|---|---|
| `data-reduce-motion="true"` | `ReduceMotion` | All transitions/animations → instant |
| `data-reduce-visual-noise="true"` | `ReduceVisualNoise` | `--fc-shadow: none`; avoid gradients |
| *(OS)* `prefers-reduced-motion` | — | Same as reduce-motion |
| *(OS)* `prefers-color-scheme: dark` | — | Dark color tokens (today); future explicit theme override via `[data-theme]` |

**Media behaviour (not tokens, but design must account for):**

| API field | Default | Design requirement |
|---|---|---|
| `HideFlashingMedia` | `true` | Placeholder before media loads when `HasFlashingWarning` |
| `DisableAutoplay` | `true` | No autoplaying video/GIF; user must click play |

---

## 9. Global utilities (code-only)

| Class / selector | Purpose |
|---|---|
| `.fc-sr-only` | Visually hidden, available to screen readers |
| `:focus-visible` | 2px `--fc-accent` outline, 2px offset, `--fc-radius-sm` |

Every interactive component must show a visible focus state matching `:focus-visible`.

---

## 10. Naming conventions

### CSS (code)

```
--fc-{category}-{name}
--fc-space-{step}     (numeric step, not px)
--fc-text-{size}      (sm | base | lg | xl)
--fc-radius[-sm]
--fc-motion[-fast]
```

### Figma Variables

```
{category}/{name}     e.g. color/accent, space/4, radius/sm
```

### Angular components

```
fc-{component}        selector prefix (already configured)
fc-button-primary     BEM-ish modifier classes in component SCSS
```

---

## 11. Change log

| Date | Change | Author |
|---|---|---|
| 2026-06-20 | Initial token contract from `src/styles.scss` | — |
| 2026-09-11 | A11y sweep: accent `#4f6df5→#4257e6`, success `#1f8a4c→#1c7d44`, warning `#b06a00→#9a5d00` (light); dark danger/success/warning → `#e06c5b`/`#4caf7d`/`#d69a3d` (old hexes failed AA at 3.0–4.4) | — |

When you change a token, add a row here and update Figma the same day.
