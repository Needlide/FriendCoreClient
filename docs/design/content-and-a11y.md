# Content, Voice & Accessibility

> Microcopy rules and validation checklists for FriendCore. Apply in Figma annotations and Angular implementation.  
> Tokens: [`design-system.md`](design-system.md) · Screens: [`screens.md`](screens.md)

---

## 1. Voice & tone

FriendCore is a **privacy-first, calm, human** platform. Copy should feel like a thoughtful friend — not a growth-hacked startup.

| Do | Don't |
|---|---|
| Plain, direct language | Jargon, legalese in UI (save legalese for legal pages) |
| Short sentences | Walls of text |
| Explain *why* a setting exists | Dark patterns ("Turn on notifications to stay connected!") |
| Neutral, respectful errors | Blame the user ("You entered wrong data") |
| Honest empty states | Fake urgency ("You're missing out!") |

**Person:** second person ("you/your") for user-facing text; first person plural ("we") sparingly for platform actions ("We sent a verification email").

**Reading level:** aim for ~B1/B2 (plain language). Avoid idioms that don't translate well (Ukrainian release is planned).

---

## 2. Microcopy patterns

### Buttons

- **Primary action:** verb first — "Sign in", "Create post", "Follow", "Send", "Save changes"
- **Destructive:** name the action — "Block", "Delete post", "Log out" (not vague "Confirm")
- **Loading:** keep label or swap to "Signing in…" / "Saving…" (ellipsis indicates progress)

### Form labels & helpers

- Labels **always visible** above the field (not placeholder-only).
- Helper text explains format: "2–30 characters. Letters, numbers, underscores."
- Password: "At least 8 characters" (match API validation messages when possible).

### Empty states

Structure: **heading** (what's empty) + **one sentence** (why / what to do) + **optional CTA**.

Examples:
- Home feed (no follows): **"Your feed is empty"** · "Follow people to see their posts here." · [Discover people]
- Messages: **"No messages yet"** · "Start a conversation from someone's profile."
- Notifications: **"Nothing new"** · "When someone interacts with you, it'll show up here."

### Success confirmations

- Brief toast, auto-dismiss ~5s: "Post published.", "Settings saved.", "Verification email sent."
- No modal for routine success.

---

## 3. Error copy (mapped to API behaviour)

The API returns `{ code, description }` arrays for 400/404/409. **Prefer `description` for display**; branch on `code` for programmatic handling.

### HTTP status rules (non-negotiable)

| Status | Body | UI copy rule |
|---|---|---|
| **401** | Empty | Login: "Invalid email or password." · Elsewhere: "Sign in to continue." |
| **403** | Empty | "This account isn't available." — **never** say banned, suspended, or blocked |
| **404** | Error array or empty | "Not found." — for profiles/posts, same copy whether missing or block (anti-enumeration) |
| **409** | Error array | Show API `description` (e.g. username taken) |
| **400** | Error array | Field-level or banner; show `description` |
| **429** | `{ Code, Description }` + `Retry-After` | "Too many requests. Try again in {n} seconds." |
| **0 / network** | — | "Couldn't reach the server. Check your connection and try again." |

### Known error codes

| Code | When | Suggested copy |
|---|---|---|
| `User.EmailNotVerified` | Post while unverified | "Verify your email before posting." + [Resend email] |
| `Common.RateLimited` | 429 | Use `Retry-After` header |
| `Auth.Unauthorized` | Client-normalized 401 | See 401 rules above |
| `Auth.Forbidden` | Client-normalized 403 | See 403 rules above |

**Login specifically:** 401 and 403 must use **different** messages (401 = wrong credentials; 403 = account unavailable) but both stay generic — no hints about which field failed or why the account is unavailable.

---

## 4. Safety & moderation copy

### Block

- **Immediate block** (no follow relationship): no modal; brief toast "Blocked."
- **Follow relationship exists:** modal title "Block @{username}?" · body "You follow each other. You won't see each other's posts or messages." · actions [Cancel] [Block]

After block: navigating to their profile shows **404-style "Profile not found"** — do not say "You blocked this user."

### Mute

- "Mute @{username}" · "Their posts won't appear in your feed. They won't know you muted them."

### Report

- Title: "Report this post" (or profile/media as appropriate)
- Subtitle: "Your report is reviewed by a person. Misuse of reporting may affect your account."
- Success: "Thanks — we'll review this."

### Flashing media placeholder

- Title: "Sensitive media"
- Body: "This media may contain flashing lights or intense motion."
- Primary: **"Show media"** (explicit consent — do not load image until clicked)
- Secondary: "Skip" / scroll past

When `HideFlashingMedia` is off, still show creator-declared warnings but may load media — follow API + preference logic.

---

## 5. Notification copy (hydrated from REST)

Push payloads are ID-only; **display text comes from REST** after reconcile. Template patterns:

| Type | Pattern |
|---|---|
| NewFollower | "{displayName} started following you" |
| NewLike | "{displayName} liked your post" |
| NewComment | "{displayName} commented on your post" |
| NewMessage | "{displayName} sent you a message" |

Use relative time ("2h ago") with `<time datetime="ISO">` for accessibility.

---

## 6. Settings explanations (beside each toggle)

| Setting | Explanation copy |
|---|---|
| Hide flashing media | "Show a warning before loading media that may contain flashing lights or intense motion." |
| Reduce motion | "Minimize animations and transitions across the app." |
| Disable autoplay | "Don't play GIFs or videos until you press play." |
| Reduce visual noise | "Use a flatter look with fewer shadows and visual effects." |
| Content preference | "Control whether sensitive or explicit content appears in your feed and discovery." |

---

## 7. WCAG 2.2 AA checklist (design + implementation)

Use when reviewing Figma mockups **and** implemented screens.

### Perceivable

- [ ] **1.4.3 Contrast:** Text ≥ 4.5:1 (normal), 3:1 (large text ≥18px bold / 24px). Check `color/text` on `color/surface` and `color/text-muted` on `color/surface` in both light and dark modes.
- [ ] **1.4.11 Non-text contrast:** UI controls and focus indicators ≥ 3:1 against adjacent colors.
- [ ] **1.4.4 Resize text:** Layout works at 200% zoom without horizontal scroll on mobile.
- [ ] **1.4.10 Reflow:** Content reflows at 320px width.
- [ ] **1.4.12 Text spacing:** Survives increased letter/word/line spacing (user stylesheet overrides).
- [ ] **1.4.13 Content on hover/focus:** Tooltips dismissible, hoverable, persistent until dismissed.

### Operable

- [ ] **2.1.1 Keyboard:** All functionality available via keyboard (no mouse-only actions).
- [ ] **2.4.1 Bypass blocks:** "Skip to content" link as first focusable element.
- [ ] **2.4.3 Focus order:** Tab order matches visual/logical order.
- [ ] **2.4.6 Headings and labels:** Descriptive headings; form labels present.
- [ ] **2.4.7 Focus visible:** `:focus-visible` ring on all interactive elements (global style in `styles.scss`).
- [ ] **2.4.11 Focus not obscured (AA):** Focused element not fully hidden by sticky headers/modals.
- [ ] **2.5.8 Target size (AA):** Touch targets ≥ 24×24px (aim for 44×44 on mobile).

### Understandable

- [ ] **3.2.3 Consistent navigation:** Nav in same position every screen (app shell).
- [ ] **3.2.4 Consistent identification:** Same icons/labels for same functions.
- [ ] **3.3.1 Error identification:** Errors described in text, not colour alone.
- [ ] **3.3.2 Labels or instructions:** All inputs labelled.
- [ ] **3.3.3 Error suggestion:** Offer fix where possible ("Username is already taken").
- [ ] **3.3.4 Error prevention (legal/financial/data):** Confirm destructive actions (block, delete post).

### Robust

- [ ] **4.1.2 Name, role, value:** Custom components expose correct ARIA / native semantics (see [`components.md`](components.md)).
- [ ] **4.1.3 Status messages:** Toasts use `role="status"` or `role="alert"`.

---

## 8. COGA / cognitive accessibility checklist (design review)

Supplemental guidance from W3C *Making Content Usable for People with Cognitive and Learning Disabilities*. Not legally required beyond WCAG, but **core to FriendCore's product values**.

### Reduce cognitive load

- [ ] One primary action per screen (secondary actions visually quieter).
- [ ] Content chunked with headings; no dense control walls.
- [ ] Main reading column ≤ ~70 characters (`--fc-content-max`).
- [ ] Progress shown on multi-step flows (onboarding, post with media).

### Predictability

- [ ] Navigation consistent across all screens (same items, same order).
- [ ] No surprise context changes (opening links in same tab unless external).
- [ ] Feed is **chronological** — UI says so explicitly ("Latest from people you follow").

### Distraction management (ADHD-critical)

- [ ] No autoplaying media by default (`DisableAutoplay` default on).
- [ ] No infinite scroll — explicit "Load more" button.
- [ ] No pulsing notification badges or engagement bait.
- [ ] No unexpected modals / pop-ups (cookie banner excepted for legal compliance).
- [ ] Animations short (≤200ms) and skippable via Reduce motion.
- [ ] Flashing media blocked until explicit "Show media" consent.

### Memory & attention support

- [ ] Form data not lost on validation error (values preserved).
- [ ] Session stays alive via silent refresh — no aggressive "session expired" mid-task.
- [ ] Confirmation before irreversible actions (block, delete).
- [ ] FAQ/help reachable from settings (future; note in design if deferred).

### Plain language

- [ ] UI copy passes plain-language review (see §1–2 above).
- [ ] Error messages say what happened **and** what to do next.

### Personalization (API-backed)

- [ ] `ReduceMotion` → `[data-reduce-motion="true"]`
- [ ] `ReduceVisualNoise` → `[data-reduce-visual-noise="true"]`
- [ ] `HideFlashingMedia` → placeholder pattern
- [ ] `DisableAutoplay` → no autoplay
- [ ] Settings toggles explain effect in one sentence (§6)

---

## 9. Testing plan

| Layer | Tool / method | When | Status |
|---|---|---|---|
| Automated | axe-core in unit/e2e tests | Every PR | TODO (not wired yet) |
| Automated static pass | Contrast-ratio script + template audit (labels, landmarks, targets, motion hooks) | Sep 2026 | Done — fixed 6 failing token pairs, 3 sub-24px targets, duplicate `<main>`, 2 missing h1s |
| Manual keyboard | Tab through each new screen | Per feature | Pending |
| Screen reader | VoiceOver (macOS) or NVDA (Windows) | Per major flow | Pending |
| Contrast | Figma contrast plugin + browser DevTools | When changing tokens | Tokens verified by script; re-verify on change |
| Cognitive | Task-based review with checklist §8 | Before beta | Pending |
| User research | Usability sessions with neurodivergent participants | Before Ukrainian public release (COGA recommendation) | Pending |

Automated tools **cannot** fully evaluate cognitive barriers — manual review is mandatory for §8.

---

## 10. Copy deck location (future)

As screens are designed, optionally maintain a **Copy** page in Figma or a `docs/design/copy-deck.md` with final strings per screen. For MVP, strings can live in Angular i18n files when localization is added (Ukrainian release).

Suggested structure when ready:
```
auth.login.title
auth.login.error.invalidCredentials
feed.empty.heading
...
```

---

## 11. Quick reference card (print or pin in Figma)

```
VOICE:     calm · plain · honest · no dark patterns
ERRORS:    show description · branch on code · 401 ≠ 403 on login
BLOCK:     never reveal · 404 profile · confirm if following
MEDIA:     placeholder first · "Show media" · no src until click
FEED:      chronological · load more · not infinite scroll
MOTION:    200ms max · respect reduce-motion
FOCUS:     always visible · skip link · trap in modals
NOTIFS:    quiet count · no pulse · reconcile via REST
```
