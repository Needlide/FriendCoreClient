# Screen & Flow Inventory

> Every MVP screen to design in Figma (**Screens** page) and implement in Angular.  
> Design **mobile (390px)** and **desktop (1280px)** for each. Design **every state** listed — not just the happy path.

Components: [`components.md`](components.md) · Copy rules: [`content-and-a11y.md`](content-and-a11y.md)

**State legend:** ✅ = must design · Route = Angular path (future)

---

## Global patterns (all authenticated screens)

| Pattern | States | Notes |
|---|---|---|
| App shell | ✅ default | Top bar + nav; see `AppShell` component |
| Loading (full page) | ✅ skeleton | Initial route load |
| Network error | ✅ banner/toast | `ApiError` status 0 |
| Rate limited (429) | ✅ toast | Show `Retry-After` message; back off |
| Session expired | ✅ redirect | After failed refresh → login |

---

## 1. Authentication (guest)

### Login

| | |
|---|---|
| **Route** | `/auth/login` |
| **API** | `POST /api/v1/auth/login` |
| **Guard** | `guestGuard` |

| State | Design requirement |
|---|---|
| ✅ Empty form | Username + password fields, submit, links to register and forgot-password |
| ✅ Loading | Button spinner, fields disabled |
| ✅ Error 401 | "Invalid email or password." (generic — anti-enumeration) |
| ✅ Error 403 | "This account isn't available." (never say banned/suspended) |
| ✅ Error 429 | Rate limit message with retry guidance |
| ✅ Validation 400 | Field-level errors from API `code` array |

### Register

| | |
|---|---|
| **Route** | `/auth/register` |
| **API** | `POST /api/v1/auth/register` |

| State | Design requirement |
|---|---|
| ✅ Empty form | Username, display name, email, password |
| ✅ Loading | |
| ✅ Success 201 | Redirect to onboarding or "check your email" |
| ✅ Error 409 | Username/email taken — show `description` from API |
| ✅ Validation 400 | Field errors |

### Forgot / reset password

| | |
|---|---|
| **Routes** | `/auth/forgot-password`, `/auth/reset-password?token=...` |
| **API** | `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password` |
| **Guards** | `guestGuard` |

| State | Design requirement |
|---|---|
| ✅ Forgot form | Username + email; blind success ("if it matches, an email is on its way") — never reveal whether anything matched |
| ✅ Reset form | New password (≥8 chars); invalid/expired token → calm error, no retry loop |
| ✅ Success | Confirmation + link back to sign in |

### Verify email

| | |
|---|---|
| **Route** | `/auth/verify-email?token=...` |
| **API** | `POST /api/v1/auth/verify-email` |

| State | Design requirement |
|---|---|
| ✅ Pending | "Verifying…" spinner |
| ✅ Success | Session restored; redirect home or onboarding |
| ✅ Error | Invalid/expired token message + link to resend (if logged in) |

### Verify-email gate (in-app prompt)

| | |
|---|---|
| **Trigger** | `POST /api/v1/posts` → `400 User.EmailNotVerified` |
| **API** | `POST /api/v1/auth/resend-verification` (takes the email — the server stores none) |

| State | Design requirement |
|---|---|
| ✅ Banner/modal | Calm explanation; "Resend verification email" button |
| ✅ Resend success | 204 — confirmation toast |
| ✅ Resend 409 | Already verified — dismiss gate |

---

## 2. Onboarding

| | |
|---|---|
| **Route** | `/onboarding` |
| **API** | `PUT /api/v1/users/me/tags`, discovery/follow endpoints |
| **When** | After first registration (before empty home feed) |

| Step | States |
|---|---|
| ✅ Tag selection | Primary (≤6) + secondary (≤20); TagInput autocomplete |
| ✅ Tag limits | Error when exceeding limits |
| ✅ Suggested follows | 5–10 profiles (cold-start §9.3); UserCard + follow |
| ✅ Skip option | Can skip follows but not tags (or allow skip all — decide in design) |
| ✅ Complete | Enter app shell → home feed |

---

## 3. Home feed

| | |
|---|---|
| **Route** | `/` |
| **API** | `GET /api/v1/feed/home?cursor=` |
| **Guard** | `authGuard` |

| State | Design requirement |
|---|---|
| ✅ Loading | Skeleton PostCards |
| ✅ Populated | Chronological list; PostCard components |
| ✅ Load more | Button at bottom (not infinite scroll) — passes `nextCursor` |
| ✅ End of feed | "You're all caught up" — clear, calm |
| ✅ Empty | New user / no follows — CTA to Discover or onboarding |
| ✅ Error | Retry action |

---

## 4. Post detail (built — linked from feed via the comment count)

| | |
|---|---|
| **Route** | `/posts/:id` |
| **API** | `GET /api/v1/posts/{id}`, comments endpoints |

| State | Design requirement |
|---|---|
| ✅ Post + comments | Full post, comment list, add comment |
| ✅ 404 | Post not found (may be block — same UX) |

---

## 5. Post composer (inline or modal)

| | |
|---|---|
| **API** | `POST /api/v1/media`, `GET /api/v1/media/{id}/status`, `POST /api/v1/posts` |

| State | Design requirement |
|---|---|
| ✅ Idle | Text + attach |
| ✅ Uploading | Progress % |
| ✅ Processing | Poll status "Processing…" (~1–2s backoff) |
| ✅ Media ready | Thumbnail preview; can attach |
| ✅ Media failed | Error + remove + retry |
| ✅ Submitting post | Loading |
| ✅ Success | Post appears in feed |
| ✅ Unverified gate | See verify-email gate |
| ✅ Sensitivity | General / Sensitive / Explicit selector if exposed |
| ✅ Safety checkboxes | Flashing / intense motion (upload step) |

---

## 6. Discovery

| | |
|---|---|
| **Route** | `/discover` |
| **API** | `GET /api/v1/feed/discovery/people`, `GET /api/v1/feed/discovery/posts` |

| State | Design requirement |
|---|---|
| ✅ Tabs | People · Posts (Blogs/Packs deferred) |
| ✅ People tab | UserCard list, tag overlap context |
| ✅ Posts tab | PostCard from non-followed tag-matched users |
| ✅ Loading | Skeleton |
| ✅ Empty | "Nothing new to discover right now" |
| ✅ Error | Retry |

---

## 7. Profile

### View (self or other)

| | |
|---|---|
| **Route** | `/u/:username` |
| **API** | `GET /api/v1/users/{username}`, `GET /api/v1/users/{username}` posts |

| State | Design requirement |
|---|---|
| ✅ Self | Edit button, settings link |
| ✅ Other | FollowButton, Message button, BlockMuteMenu |
| ✅ Avatar + bio + tags | Bio, website, location; initials avatar (no avatar URL in API) |
| ✅ Activity status | DEFERRED — no API exists (planned post-MVP); do not design |
| ✅ Posts tab | User's posts, cursor pagination |
| ✅ 404 | Profile not found (includes block — do not reveal block) |
| ✅ Loading / empty posts | |

### Edit profile

| | |
|---|---|
| **Route** | `/settings/profile` or inline edit |
| **API** | `PATCH /api/v1/users/me/profile` |

| State | Design requirement |
|---|---|
| ✅ Form | Bio, website, location |
| ✅ Saving / saved / error | |

### Edit tags

| | |
|---|---|
| **Route** | `/settings/interests` (also the recovery path for skipped onboarding) |
| **API** | `GET /users/me/tags`, `PUT /users/me/tags` |

| State | Design requirement |
|---|---|
| ✅ TagInput with tier + public/private per tag | |

### Block confirm modal

| | |
|---|---|
| **Trigger** | Block action when viewer follows target (or target follows viewer) |
| **API** | `POST /api/v1/users/{username}/block` |

| State | Design requirement |
|---|---|
| ✅ Confirm | "You follow this person. Block anyway?" |
| ✅ Immediate block | When no follow relationship — no modal |

---

## 8. Messaging

### Conversation list

| | |
|---|---|
| **Route** | `/messages` |
| **API** | `GET /api/v1/conversations` |

| State | Design requirement |
|---|---|
| ✅ List | ConversationRow items, unread indicators |
| ✅ Empty | "No messages yet" + start conversation hint |
| ✅ Loading / error | |

### Conversation thread

| | |
|---|---|
| **Route** | `/messages/:conversationId` |
| **API** | `GET /api/v1/conversations/{id}/messages?cursor=`, `POST .../messages`, `POST .../read` |
| **Realtime** | `MessageReceived` → reconcile list |

| State | Design requirement |
|---|---|
| ✅ Messages | MessageBubble thread, newest at bottom or top (match API order: newest-first — display reversed) |
| ✅ Composer | MessageComposer at bottom |
| ✅ Sending / failed | |
| ✅ Load older | Cursor pagination for history |
| ✅ 404 | Conversation not found (block) |
| ✅ Mark read | On open / scroll — `POST .../read` |

### Start conversation

| | |
|---|---|
| **API** | `POST /api/v1/conversations` (find-or-create by username), `POST /api/v1/conversations/support` (admin inbox) |

| State | Design requirement |
|---|---|
| ✅ New DM | Pick user (from profile "Message" button) |
| ✅ Support entry | "Message the team" in empty state + `/help` page; expectation copy (async, no presence) |

---

## 9. Notifications

| | |
|---|---|
| **Route** | `/notifications` |
| **API** | `GET /api/v1/notifications`, `GET /api/v1/notifications/unread-count`, `POST /api/v1/notifications/read` |
| **Realtime** | `NotificationReceived` → bump badge, reconcile list |

| State | Design requirement |
|---|---|
| ✅ List | NotificationItem rows with hydrated REST data |
| ✅ Empty | "No notifications" |
| ✅ Mark all read | Action in header |
| ✅ Bell badge | Quiet count in app shell (no pulse) |

---

## 10. Settings

| Section | Route | API |
|---|---|---|
| Account | `/settings/account` | verification state, resend, logout |
| Profile | `/settings/profile` | `PATCH .../profile` |
| Preferences | `/settings/preferences` | `GET` + `PATCH .../preferences` |
| Keyword filters | `/settings/filters` | `GET/PATCH .../keyword-filters` |
| Moderation & appeals | `/settings/appeals` | `GET users/me/moderation-actions`, `POST /appeals` |
| Username change | — | DEFERRED — no endpoint exists; usernames immutable for MVP |
| Blocked / muted lists | — | DEFERRED — no list endpoints (only block/unblock, mute/unmute by username); unblock from the profile, or await a future `GET /users/me/blocks` |

### Preferences screen states

| Toggle | API field | Design note |
|---|---|---|
| Hide flashing media | `HideFlashingMedia` | Explain seizure/flashing safety |
| Reduce motion | `ReduceMotion` | Explain UI animations |
| Disable autoplay | `DisableAutoplay` | Explain GIF/video behaviour |
| Reduce visual noise | `ReduceVisualNoise` | Explain shadows/gradients |
| Content preference | `ContentPreference` | Filter explicit content |

Each: ✅ on, ✅ off, ✅ saving, ✅ error

**Chat composer** (its own group, not under accessibility — a send-key binding is a composer
setting, and the group above is labelled "Accessibility toggles"):

| Toggle | API field | Default | Design note |
|---|---|---|---|
| Send with Enter | `SendMessageOnEnter` | `true` | On: Enter sends, Shift+Enter newline. Off: Enter newline, Ctrl+Enter or Cmd+Enter sends. Name both modifier spellings — Cmd is the key under a Mac user's spacebar. |

### Logout

| | |
|---|---|
| **API** | `POST /api/v1/auth/logout` |

| State | Design requirement |
|---|---|
| ✅ Confirm optional | Logout clears session + disconnects SignalR |

---

## 11. Safety / reporting

### Report dialog

| | |
|---|---|
| **Trigger** | From PostCard, profile menu |
| **API** | `POST /api/v1/posts/{id}/report`, `POST /api/v1/users/{username}/report` (media safety is a separate flags-based endpoint — not this dialog) |

| State | Design requirement |
|---|---|
| ✅ Category picker | 9 categories (see content-and-a11y.md) |
| ✅ Optional note | |
| ✅ Submit success | Thank you + what happens next |
| ✅ Error | |

Categories (user-facing):
1. Spam or fake
2. Harassment or hateful content
3. Nudity or sexual content
4. Violence or dangerous activity
5. Private information
6. Copyright violation
7. Minor safety concern
8. Flashing lights / seizure risk
9. Something else

---

## 12. Search (deferred — no user-search endpoint exists)

Do not design search for MVP. If a top-bar search box appears in shell mockups,
mark it explicitly deferred.

---

## 13. Critical user flows (prototype in Figma)

Link these on **Flows / Prototype** page:

| # | Flow | Screens involved |
|---|---|---|
| 1 | First-time user | Register → verify → onboarding → home |
| 2 | Returning user | Login → home |
| 3 | Create post with image | Home → composer → upload → poll → publish |
| 4 | Discover & follow | Discover → profile → follow |
| 5 | Direct message | Profile → message → thread → send |
| 6 | Block someone you follow | Profile → block → confirm → 404 on revisit |
| 7 | Email gate | Try post unverified → prompt → resend → verify → post |
| 8 | Flashing media safety | View post with warning → placeholder → "Show media" |
| 9 | Preferences | Settings → toggle reduce motion → visual change |
| 10 | Logout | Settings → logout → login screen |

---

## 14. Screen checklist (track design progress)

All screens are built in code as of Sep 2026 — but WITHOUT responsive breakpoints
yet (no mobile tab bar, no media queries; desktop-first single column). Use this
table to track the remaining Figma + responsive work, not code completion.

| Screen | Mobile | Desktop | States complete |
|---|---|---|---|
| Login | ☐ | ✅ | ✅ |
| Register | ☐ | ✅ | ✅ |
| Verify email | ☐ | ✅ | ✅ |
| Forgot / reset password | ☐ | ✅ | ✅ |
| Onboarding | ☐ | ✅ | ✅ |
| Home feed | ☐ | ✅ | ✅ |
| Post composer | ☐ | ✅ | ✅ |
| Discovery | ☐ | ✅ | ✅ |
| Profile (other) | ☐ | ✅ | ✅ |
| Profile (self) | ☐ | ✅ | ✅ |
| Messages list | ☐ | ✅ | ✅ |
| Message thread | ☐ | ✅ | ✅ |
| Notifications | ☐ | ✅ | ✅ |
| Settings (each section) | ☐ | ✅ | ✅ |
| Report dialog | ☐ | ✅ | ✅ |
| Block confirm | ☐ | ✅ | ✅ |
| Media safe placeholder | ☐ | ✅ | ✅ |
| Empty / error / 429 (global) | ☐ | ✅ | ✅ |

---

## 15. API quick reference (MVP endpoints by screen)

| Screen | Primary endpoints |
|---|---|
| Auth | `/auth/register`, `/login`, `/verify-email`, `/refresh`, `/logout`, `/resend-verification` |
| Feed | `/feed/home` |
| Discovery | `/feed/discovery/people`, `/feed/discovery/posts` |
| Posts | `/posts`, `/posts/{id}`, `/posts/{id}/like`, `/posts/{id}/comments`, `/comments/{commentId}` (delete), `/posts/{id}/report` |
| Media | `/media`, `/media/{id}/status`, `/media/{id}` (delete) |
| Users | `/users/{username}`, `/users/{username}/posts`, `/users/me/profile`, `/users/me/preferences` (GET+PATCH), `/users/me/tags`, `/users/me/keyword-filters` (GET+PATCH), follow/unfollow, block/unblock, mute/unmute, followers/following lists, `/users/{username}/report` |
| Tags | `/tags/autocomplete` |
| Messaging | `/conversations`, `/conversations/support`, `/conversations/{id}/messages`, `/conversations/{id}/read` |
| Notifications | `/notifications`, `/notifications/unread-count`, `/notifications/read` |
| Appeals | `/users/me/moderation-actions`, `/appeals` |

Full API details: backend Technical Specifications §17.2, `docs/UI-Plan.md` §1–2,
and the integration guide in the API repo.
