# FriendCore Web Client — UI & Design Plan

> Status: MVP client built (auth → settings/appeals/safety, UI-Plan §1 routes all live).
> This doc is the design *direction*; [`UI-Plan.md`](UI-Plan.md) is the authoritative
> route + endpoint map, and [`docs/design/`](design/README.md) holds the Figma specs.

## Decisions (locked in)

| Decision | Choice |
|---|---|
| Angular | **v22** |
| Styling | **Custom-only** (SCSS + `var(--fc-*)` tokens in `src/styles.scss`) |
| Token source of truth | **Code-first, manual Figma mirror** (no automated pipeline for MVP) |
| Design docs | [`docs/design/`](design/README.md) — token contract, Figma guide, components, screens, a11y |

## 1. Design philosophy (derived from the spec)

The Tech Spec is unusually opinionated, and that opinion should drive every UI decision:

- **"Philosophically opposed to algorithmic manipulation, surveillance capitalism, and
  obnoxious UX patterns."** → No infinite-scroll dark patterns, no engagement bait, no
  red-dot dopamine spam, no autoplaying media by default, no "you're about to lose your
  streak" nonsense. The feed is **chronological and follow-only** — the UI must make that
  calm predictability a feature, not hide it.
- **Privacy-first.** → No third-party fonts/CDNs/trackers/analytics beacons. Self-host
  everything. (We already use a system font stack — zero web-font fetches.)
- **Accessibility is a product pillar, not a checkbox.** The API ships
  `UserPreferences` with `HideFlashingMedia` (default **on**), `DisableAutoplay`
  (default **on**), `ReduceMotion`, and `ReduceVisualNoise`. The client must honor all of
  them, and they map cleanly onto the design-token system.

Aesthetic target: **calm, quiet, content-first.** Generous whitespace, a restrained
low-saturation palette, one accent color, strong typographic hierarchy. Distinctive
through restraint and craft — not through gradients-and-glassmorphism trend-chasing.

## 2. Styling approach: custom tokens first, Tailwind optional (the research answer)

You asked whether Tailwind "loads everything." **It does not** — that's the key
misconception to clear up:

- Tailwind is a **build-time utility generator**, not a runtime component library. In
  **Tailwind v4** it scans your source for class names and emits CSS **only for the
  classes you actually use** (automatic content detection). Unused utilities never ship.
  Typical output is tens of KB, often **smaller** than hand-written CSS at scale.
- This is the opposite of **Angular Material / PrimeNG**, which ship JavaScript
  components and a strong built-in visual identity. Those make apps *look the same* and
  add real JS weight — which is exactly why **Material is ruled out** for a platform whose
  whole point is to *not* look generic.

So the real choice is **custom CSS** vs **custom CSS + Tailwind as a utility layer** —
both produce a fully custom look.

**Recommendation: custom design tokens as the source of truth (already scaffolded in
`src/styles.scss`), with Tailwind v4 as an optional utility layer bound to those tokens.**

- The tokens (CSS custom properties) are framework-agnostic and drive theming +
  accessibility. They are the contract; components reference `var(--fc-*)`.
- If you want velocity (you're a solo dev building a large surface), add Tailwind v4 via
  `ng add tailwindcss` (officially supported on Angular 22) and wire it to the tokens with
  CSS-first `@theme` so utilities stay on-brand and purge to only-used classes.
- One caveat from the Tailwind team: **v4 is its own preprocessor and isn't meant to be
  paired with Sass.** Since we scaffolded with SCSS, the cleanest path if you adopt
  Tailwind is to switch the workspace to plain CSS (v4 gives you nesting + variables
  natively, so you lose nothing) or run a separate `tailwind.css` alongside SCSS. If you
  stay **custom-only**, SCSS is great as-is.

**Decision:** **custom-only** for MVP (tokens + component SCSS). Tailwind can be layered
in later without rework because everything routes through tokens.

## 3. Design tokens & theming

Already scaffolded in `src/styles.scss` (color, type scale, spacing, radius, shadow,
motion). Theming model:

- **Light/dark** via `prefers-color-scheme`, plus a future explicit `[data-theme]`
  override for a user setting.
- **Accessibility prefs → `data-*` on `<html>`**, fed from the user's `UserPreferences`:
  - `data-reduce-motion="true"` → kills transitions/animations (also honors OS
    `prefers-reduced-motion`).
  - `data-reduce-visual-noise="true"` → flattens shadows/gradients.
  - (Planned) `data-text-size`, `data-contrast` for COGA-style personalization.
- A tiny `PreferencesService` reads `GET /users/me/preferences` state and sets these
  attributes; because everything is a token, the whole UI re-themes with no component
  changes. (Built: `core/preferences/preferences.service.ts`, loaded by the shell;
  safe defaults apply until the first load.)

Post-MVP custom profile CSS (deferred per spec §13.8) must stay **sandboxed in an iframe**
with an allowlist — never injected into the app document.

## 4. Accessibility & ADHD-friendly rules (the non-negotiables)

Grounded in **WCAG 2.2 AA** + the **W3C COGA** "Making Content Usable" guidance. These are
requirements for this project, not nice-to-haves:

**Focus & predictability**
- Consistent navigation in the same place on every screen (WCAG 3.2.3).
- Always-visible keyboard focus (2.4.7) — already set globally via `:focus-visible`.
- Descriptive headings/labels (2.4.6); semantic landmarks and a "skip to content" link.

**Reduce cognitive load**
- Chunk content; one primary action per screen; short line length (~60–70 chars — our
  `--fc-content-max` ≈ 42rem enforces this for text).
- Plain language in all UI copy, errors, and empty states.
- Generous whitespace; avoid dense walls of controls.

**Distraction management (core to ADHD)**
- **No autoplay** by default (respect `DisableAutoplay`); any motion is pausable.
- Flashing/seizure safety: when `HideFlashingMedia` is on and a media item
  `HasFlashingWarning`, render a **placeholder and do NOT load the source** until the user
  clicks "Show media" (matches the API's three-layer safety model; prevents the browser
  from rendering flashing content before consent).
- No notification "dopamine" patterns; the bell is a quiet count, not a pulsing alarm.

**Forms & error prevention**
- Persistent labels and inline help (3.3.2); clear, in-situ error messages.
- Multi-step flows (onboarding, post composer) show progress and allow review/undo
  before submit (3.3.6).
- No aggressive session timeouts — our **single-flight refresh** already keeps sessions
  alive silently; never surprise-logout mid-task.

**Testing**
- Automated a11y (axe) in CI, **plus** usability testing with neurodivergent users before
  the Ukrainian release (COGA explicitly says automated tools can't catch cognitive
  barriers).

## 5. Information architecture & app shell

A stable, persistent shell (consistent navigation = lower cognitive load):

```
┌───────────────────────────────────────────────┐
│  Top bar:  FriendCore   [search]   bell  avatar │
├──────────┬──────────────────────────┬───────────┤
│ Left nav │  Main column (max ~42rem)│  (context)│
│  Home    │                          │  optional │
│  Discover│   routed feature view    │  sidebar  │
│  Messages│                          │           │
│  Notifs  │                          │           │
│  Profile │                          │           │
│  Settings│                          │           │
└──────────┴──────────────────────────┴───────────┘
```

- Responsive: left nav collapses to a bottom tab bar on mobile (responsive web first;
  native apps are deferred per spec).
- Routes (lazy-loaded standalone components), guarded by `authGuard`:
  - `/` Home feed · `/discover` · `/messages` + `/messages/:id` ·
    `/notifications` · `/u/:username` (profile) · `/settings` (+ `/profile`,
    `/preferences`, `/filters`, `/appeals`, `/account`) · `/help` (support entry) ·
    `/auth/*` (guest) · `/onboarding` (first run).
  - `/onboarding` runs after registration (tag selection → 5–10 suggested follows, per
    spec §9.3 cold-start) before the user ever hits an empty home feed.

## 6. Component building blocks (the kit)

Small, composable, token-styled standalone components/directives. Build status
(Sep 2026 — see `src/app/features/`): domain components are built
(`fc-post-card`, `fc-composer`, `fc-media-viewer`, `fc-tag-input`, `fc-user-card`,
`fc-follow-button`, `fc-conversation-list`/`thread` as pages, `fc-report-dialog`,
`fc-block-mute-menu`, `fc-keyword-filters`, `fc-app-shell` as `fc-shell`,
`fc-preferences` page, `fc-notification-bell`). Deliberately NOT built as a
standalone kit: primitives (`fc-button`, `fc-text-field`, …) are native elements
styled per-screen through tokens (a rename later, not a restyle); `fc-toast` was
replaced by inline banners; `fc-comment-list` waits for the post-detail page;
media upload lives inside the composer rather than a separate `fc-media-uploader`.

## 7. Feature UI notes (tied to real API contracts)

- **Auth:** login, register, verify-email. Map the contracts exactly — 401 on login =
  "invalid email or password"; **403 = generic "this account isn't available"** (never
  reveal banned/suspended). The **email-verification gate**: posting returns
  `400 User.EmailNotVerified` → show a calm "verify your email" prompt + a "resend"
  action (`resendVerification` is already in `AuthService`).
- **Home feed:** chronological cursor pagination; "load more" (not autoplaying infinite
  scroll — deliberate, per philosophy). Show a clear end-of-feed state.
- **Post composer:** text + image attach. Media flow is **upload → poll
  `GET /media/{id}/status` until `Ready` → attach** with progress UI; attach is blocked
  until `Ready`. Sensitivity + flashing/intense-motion self-declaration checkboxes at
  upload (feeds the safety system).
- **Media display:** use the WebP variant URLs (thumbnail/small/medium/large by context).
  Honor flashing-safety placeholder rule above.
- **Discovery:** People + Posts tabs (tag-overlap). Non-paginated single response.
- **Profile & tags:** primary (≤6) / secondary (≤20) tags, public/private per tag;
  TagInput with 200–300ms debounced autocomplete; "you're the first to use this tag"
  affordance.
- **Messaging:** conversation list + thread; send via REST, receive via the
  `RealtimeService.message$` push, **reconcile via REST on `resync$`** (every reconnect).
  Read state via `POST /conversations/{id}/read`.
- **Notifications:** quiet bell with unread count; `notification$` bumps the badge, then
  reconcile `GET /notifications` for hydrated content (pushes are ID-only).
- **Safety tools (first-class, not buried):** block (full mutual; confirm modal when
  blocking someone you follow), mute, keyword filters, report (the 9 spec categories incl.
  "Flashing lights / seizure risk").

## 8. UI build order (all steps complete as of Sep 2026)

1. ~~App shell + theming + PreferencesService~~ ✅ (`features/shell`, tokens, prefs)
2. ~~Auth screens~~ ✅ (login/register/verify + guards + bootstrap)
3. ~~Onboarding and Profile view/edit~~ ✅ (tags → suggested follows; `/u/:username`)
4. ~~Feed + PostCard + PostComposer + Media~~ ✅ (cursor feed, composer, safety placeholder)
5. ~~Discovery + follow/block/mute~~ ✅ (`/discover`, shared social kit)
6. ~~Realtime UI~~ ✅ (bell + messaging + support entry, `RealtimeService` wired)
7. ~~Safety/reporting + settings~~ ✅ (report dialog, preferences, filters, appeals, account)
8. **A11y pass + usability testing** ← next

## 9. Performance & privacy specifics

- System font stack (done) — no FOIT/FOUT, no Google Fonts call.
- Lazy-load feature routes; keep the initial bundle lean (prod build tree-shakes +
  minifies; the dev 1.4 MB number is unoptimized).
- No third-party analytics/trackers. Error tracking, if any, is server-side (Sentry on the
  API) — keep the client clean.
- Images come straight from R2/CDN via the variant URLs; the client never proxies binary.

## 10. Remaining open decisions

1. **Admin dashboard** is a separate Angular app (spec §3.2) — same token system, built
   later.
2. **Explicit theme toggle** (`[data-theme]`) vs OS-only dark mode — defer until settings UI.

## 11. Design documentation

Full Figma workflow and specs:

- [`docs/design/README.md`](design/README.md) — index and workflow
- [`docs/design/design-system.md`](design/design-system.md) — token contract
- [`docs/design/figma-guide.md`](design/figma-guide.md) — step-by-step Figma setup
- [`docs/design/components.md`](design/components.md) — component kit
- [`docs/design/screens.md`](design/screens.md) — screen inventory
- [`docs/design/content-and-a11y.md`](design/content-and-a11y.md) — copy + checklists
