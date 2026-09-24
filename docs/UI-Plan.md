# FriendCore Web Client — IA & Endpoint Map

> Status: MVP client built — all routes below are live.
> Last verified against server + client code — Sep 2026.

**What lives where (don't duplicate):**

| Doc | Covers |
|---|---|
| `docs/ui-design-plan.md` | Philosophy, tokens, a11y rules, shell, component kit, build order |
| `docs/design/` | Figma workflow, component specs, copy rules, per-state screen inventory |
| **This file** | **Authoritative route table + screen→endpoint map**, verified against the real API. When this file and `design/screens.md` disagree, **this file wins** (corrections in §4). |

All API paths below are relative to `/api/v1` unless noted. Hub paths (`/hubs/*`)
live at the server root.

---

## 1. Route table (final for MVP)

| Route | Guard | Screen | Primary endpoints |
|---|---|---|---|
| `/auth/login` | guest | Login | `POST /auth/login` |
| `/auth/register` | guest | Register | `POST /auth/register` |
| `/auth/verify-email?token=` | guest | Verify email | `POST /auth/verify-email` |
| `/onboarding` | auth | Tag selection → suggested follows | `PUT /users/me/tags`, `GET /tags/autocomplete`, `GET /feed/discovery/people`, `POST /users/{u}/follow` |
| `/` | auth | Home feed | `GET /feed/home?cursor=` |
| `/posts/:id` | auth | Post detail + comments | `GET /posts/{id}`, `GET /posts/{id}/comments`, `POST /posts/{id}/comments`, `DELETE /api/v1/comments/{commentId}`, like/unlike, `POST /posts/{id}/report` |
| `/discover` | auth | Discovery (People · Posts tabs) | `GET /feed/discovery/people`, `GET /feed/discovery/posts` |
| `/u/:username` | auth | Profile (self/other) + user posts | `GET /users/{username}`, `GET /users/{username}/posts`, `GET /users/{username}/followers|following`, follow/unfollow, block/unblock, mute/unmute, `POST /conversations`, `POST /users/{username}/report` |
| `/messages` | auth | Conversation list | `GET /conversations` |
| `/messages/:id` | auth | Thread | `GET /conversations/{id}/messages?cursor=`, `POST /conversations/{id}/messages`, `POST /conversations/{id}/read`, hubs `MessageReceived` |
| `/notifications` | auth | List (actor names link to profiles), per-type mute toggles, mark-all-read | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read`, `GET/PATCH /users/me/notification-types`, hub `NotificationReceived` |
| `/settings/profile` | auth | Edit profile | `PATCH /users/me/profile` |
| `/settings/interests` | auth | Edit tags (onboarding recovery) | `GET /users/me/tags`, `PUT /users/me/tags` |
| `/settings/preferences` | auth | Toggles (flashing/motion/autoplay/noise/content) | `PATCH /users/me/preferences` |
| `/settings/filters` | auth | Keyword filters | `GET /users/me/keyword-filters`, `PATCH /users/me/keyword-filters` |
| `/settings/appeals` | auth | My moderation history + appeal | `GET /users/me/moderation-actions`, `POST /appeals` |
| `/settings/account` | auth | Session, verification state, logout | `POST /auth/resend-verification`, `POST /auth/logout` |
| `/help` (or Messages empty-state entry) | auth | **Support chat entry → thread** | `POST /conversations/support`, then standard thread endpoints |

Composer, report dialog, block-confirm modal, and the verify-email gate are
**overlays**, not routes (see §3). No `/settings/username`, no `/search`
(§4 explains why).

---

## 2. Screen → endpoint matrix (with contract notes)

### Auth (guest shell)

| Screen | Endpoint | Contract the UI must honor |
|---|---|---|
| Login | `POST /auth/login` | 401 empty body = "invalid username or password" · 403 empty body = generic "this account isn't available" (never banned/suspended) · 400 = array of `{code, description}` for field errors |
| Register | `POST /auth/register` | 201 → `AuthResponse` (session starts immediately) → route to `/onboarding` · 409 array (`User.EmailAlreadyInUse` / `User.UsernameAlreadyInUse`) → show `description` |
| Verify email | `POST /auth/verify-email` | Token from query param; success restores session |
| Forgot / reset | `POST /auth/forgot-password` (blind 204 — identical copy either way), `POST /auth/reset-password` (400 `User.InvalidResetToken` on replay/expiry) | Username + email in, neutral confirmation out; new password ≥8 chars |
| Verify gate (banner/modal) | `POST /auth/resend-verification` (takes the email — the server stores none) | Trigger: `POST /posts` → 400 `User.EmailNotVerified` · resend 204 = toast · 409 = already verified, dismiss |
| Session bootstrap | `POST /auth/refresh` (cookie, no body) | Silent on app load; **single-flight** (one in-flight promise — replaying a rotated cookie revokes the family = instant logout). Already owned by `core/http/auth.interceptor` + `core/auth/auth.service` |

### Onboarding (`/onboarding`, first login only)

Tag selection (`PUT /users/me/tags`: primary ≤6, secondary ≤20, public/private per tag;
autocomplete `GET /tags/autocomplete`, debounce 200–300ms, "you're the first" affordance)
→ suggested follows (`GET /feed/discovery/people`, show 5–10, follow inline) →
enter `/`. Skippable follows; tags required (cold-start §9.3 needs them for discovery).

### Home (`/`)

`GET /feed/home?cursor=` → `{items, nextCursor}` (opaque, 20/page). **"Load more"
button, not infinite scroll** (calm-UX principle). End state: "You're all caught up".
Empty (no follows): CTA to `/discover` or `/onboarding`. PostCard shows tags
(`PostResponse.Tags` exists), variant image by context (feed = medium/large),
flashing-safety placeholder when `HideFlashingMedia && HasFlashingWarning`
(never load the source until "Show media").

### Composer (modal/sheet from Home)

1. `POST /media` (multipart: `File`, `HasFlashingWarning`, `HasIntenseMotionWarning`; ≤20 MB, jpeg/png/webp/gif) → 201 `{id, status: Processing}`
2. Poll `GET /media/{id}/status` (~1–2 s backoff) until `Ready` (`Failed` → error + retry). **No realtime push exists** — polling is the contract.
3. `POST /posts` (text + media ids + sensitivity + tag slugs ≤12). Attach requires `Ready`.
Also: `DELETE /media/{id}` (discard upload), unverified-gate handling.

### Discovery (`/discover`)

Two tabs, single (non-paginated) responses: People (`GET /feed/discovery/people`,
show tag-overlap context) · Posts (`GET /feed/discovery/posts`, from non-followed
users). UserCard + FollowButton; empty: "Nothing new right now".

### Profile (`/u/:username`)

`GET /users/{username}` → header (avatar small variant, bio, tags), FollowButton /
Message button (`POST /conversations` find-or-create → `/messages/:id`) /
BlockMuteMenu. Tabs: posts (`GET /users/{username}/posts`, cursor) ·
followers/following lists. **404 = "not found", even when it's a block — never
reveal blocks.** Block confirm modal only when a follow relationship exists
(server returns 409 `User.BlockRequiresConfirmation` → re-send `confirmed=true`);
otherwise block is immediate, no modal. Blocking the admin account → 400
`User.CannotBlockAdmin` (show plain message). Mute/unmute are silent, no confirm.
`POST /users/{username}/report` (same 9 categories as posts).

### Messages

* List (`GET /conversations`): rows with unread counts; empty → "No messages yet" + hint.
* Thread (`/messages/:id`): `GET .../messages?cursor=` is **newest-first** — display reversed with composer at bottom. Send via REST (sender already has the message; no optimistic echo needed beyond pending state). `POST .../read` on open. `MessageReceived` push = "something changed" → reconcile via REST; also reconcile on every reconnect (`RealtimeService.resync$`).
* **Support chat**: entry point in `/help` and/or Messages empty state —
  "Message the team — thanks, bugs, quick questions. Abuse goes via Report."
  `POST /conversations/support` (find-or-create with admin inbox; 500
  `Messaging.SupportUnavailable` → "unavailable, try later"). Afterwards it is a
  normal thread. Copy must set expectations: no presence indicator, async replies.

### Notifications (`/notifications`)

Quiet bell (header, count only — no pulse). `GET /notifications/unread-count`
for badge, `GET /notifications` for hydrated list (pushes are ID-only),
`POST /notifications/read`. Push → bump badge → reconcile list. Actor names link
to profiles. "What notifies you" toggles mute whole types via
`GET/PATCH /users/me/notification-types` — muted types are never created
server-side, so the bell stays truthful with no client math. "Snooze everything"
(`GET`, `POST`, `DELETE /users/me/snooze`) silences all types until an instant;
the bell shows muted while active.

### Settings

| Section | Endpoints | Notes |
|---|---|---|
| Profile + tags | `PATCH /users/me/profile`, `PUT /users/me/tags` | Same TagInput as onboarding |
| Preferences | `PATCH /users/me/preferences` | Toggles drive `<html> data-*` attributes (token re-theme, no component changes). Needs a `PreferencesService` (planned in ui-design-plan §3) |
| Keyword filters | `GET` + `PATCH /users/me/keyword-filters` | Limits enforced server-side; surface messages |
| Appeals | `GET /users/me/moderation-actions`, `POST /appeals` | History list + appeal form (action → link). Different-moderator review is server-side |
| Account | `POST /auth/resend-verification`, `POST /auth/logout` | Logout → clear token, close both hubs, go to `/auth/login` |

### Safety overlays

Report dialog (post/profile/media triggers): `POST /posts/{id}/report`,
`POST /users/{username}/report`, `POST /media/{id}/report-safety` — 9 fixed
categories, optional note, "thank you + what happens next" success state.

---

## 3. Global rules (every screen)

* **Error normalization** (`core/http/normalize-error`): 400/404/409 → array
  `{code, description}` (branch on `code`, show `description` as fallback); 401/403
  → empty body (decide by status only); 429 → `{Code, Description}` PascalCase +
  `Retry-After` header → toast + back off. Limits: auth 10/min, rest 120/min per IP.
* **IDs** are Ulids as opaque strings — never parse/sort/generate client-side.
* **Cursors** are opaque — pass back verbatim; `null` = end.
* **SignalR**: two push-only hubs (`/hubs/notifications` → `NotificationReceived`,
  `/hubs/messaging` → `MessageReceived`), auth via `accessTokenFactory` returning a
  **fresh** token, `withAutomaticReconnect()`. Connect after login, tear down on logout.
* **Local dev**: SPA on `http://localhost:3000`, API `http://localhost:8080`,
  `Storage:PublicBaseUrl` must be browser-reachable (`http://localhost:9000/<bucket>`),
  all requests `credentials: 'include'`.

---

## 4. Corrections to older docs (read before Figma)

| Claim | Reality | Action |
|---|---|---|
| `screens.md §10`: `/settings/username` → `PATCH .../username` | **Endpoint does not exist** (no command, no entity field) | **Cut the screen.** Usernames immutable for MVP |
| `screens.md §7`: "Activity status — if set" | **No API exists** (no command wired) | **Cut from profile.** Revisit post-MVP |
| `screens.md §12`: Search, `GET /users/search` | **Endpoint does not exist** | **Cut search.** Top-bar search box in the shell diagram — remove it or keep as a visual slot marked deferred |
| `screens.md §10`: "Blocked / muted lists" in settings | **No list endpoints** (only block/unblock, mute/unmute by username) | No unblock-list screen possible. Workaround: unblock from the profile (but blocked profiles 404…). **Server follow-up candidate**: `GET /users/me/blocks` + `/mutes` (small, high UX value — otherwise a block is nearly irreversible from the UI) |

---

## 5. Personas → build priority (why this order)

* **Alex (privacy-seeker)**: calm feed, quiet bell, honest error copy, no trackers → Home + Notifications + global rules first.
* **Jamie (niche-connector)**: tags + discovery ASAP → Onboarding + Discovery right after the core loop.
* **Sam (creator)**: composer with real upload states → part of the core loop (step 2).
* **Casey (lurker)**: zero-pressure browsing, easy mute, skippable onboarding → empty states, mute-first safety UI, skip affordances everywhere.

Build order (all steps complete as of Sep 2026):

1. ~~App shell + theming + `PreferencesService`~~ ✅
2. ~~Auth screens~~ ✅
3. ~~Onboarding + Profile view/edit~~ ✅
4. ~~Feed + PostCard + Composer + Media~~ ✅
5. ~~Discovery + follow/block/mute~~ ✅
6. ~~Notifications bell + Messaging incl. support entry~~ ✅
7. ~~Settings + appeals + report polish~~ ✅
8. **A11y pass + usability testing** ← next

---

## 6. Auth module brief (built)

`AuthService` + `authGuard`/`guestGuard` + single-flight `auth.interceptor` +
`normalize-error` + `endpoints.ts` + session bootstrap on app load were the
pre-existing core. Built on top: `/auth/login`, `/auth/register` (→ `/onboarding`),
`/auth/verify-email` screens, logout teardown (realtime first, then server session).
OAuth deferred — the `AuthResponse` session shape leaves room for a future
"Sign in with Google".
