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
| `/messages/:id` | auth | Thread | `GET /conversations/{id}/messages?cursor=`, `POST /conversations/{id}/messages`, `POST /conversations/{id}/read`, `POST /conversations/{id}/messages/{messageId}/reactions`, hubs `MessageReceived` |
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
* **Replies**: every bubble's `⋯` menu offers **Reply**, including one that is itself a reply —
  quoting goes one level deep at most, so it never nests. A **Reply** bar sits with the other
  pre-send inputs (safety declaration, attachment) and carries the target's text; cancelling it
  never eats the draft, and sending consumes it. The quoted parent renders inside the bubble
  above the text as a short excerpt. If the parent is deleted, the quote **survives** and
  relabels to "Deleted message" rather than vanishing — a reply whose quote disappeared would
  read as the first word in the thread. `MessageDeleted` and `MessageEdited` pushes update every
  loaded quote that pointed at the changed message, so the push route and a refetch converge.
* **Per-message actions**: `⋯` menu under the bubble. **React** leads it and appears on
  *every* bubble — anyone in the thread may react to anything in it, their own messages
  included, which is the one action that is not the sender's privilege. It opens a picker
  **in place** (not a hover-only smiley, same rule as the rest of this menu) listing the
  server's fixed set of seven emoji; nothing else is offered, and the client list mirrors
  the server allow-list.
  Existing reactions render as chips under the bubble — glyph + count, highlighted and
  `aria-pressed` when yours, ordered most-reacted first. Tapping a chip toggles it
  (`POST .../messages/{messageId}/reactions`, body `{emoji}`), optimistic with rollback, and a
  count reaching 0 drops the chip entirely rather than leaving a bare "0".
  `MessageReactionChanged` pushes the emoji's new state to **both** participants.
* **Own message, continued**: **Edit** (`PATCH .../messages/{messageId}`, inline textarea,
  optimistic with rollback) and
  **Delete** (`DELETE .../messages/{messageId}`, confirm panel, removed only on success).
  An edit sends the message's `version` alongside the text. If that version is stale — nearly
  always this same account saving from another device — the server answers **409** and the
  editor **keeps the draft**, says so in different copy (a conflict is not "try again"; an
  unchanged retry conflicts identically), shows *Currently saved: …* above the draft, and
  refetches the page. Saving again then overwrites deliberately, having read what it replaces.
  Delete takes no version and is never blocked by one.
  Both push `MessageEdited` / `MessageDeleted` to **both** participants, so an open thread on
  either side corrects itself. Edit is text-only — an attachment-only bubble offers no Edit.
  On the other participant's message the menu offers **Report** instead (self-reports are
  refused server-side, so the option is not shown). Every bubble also renders its sent time
  via `RelativeTimePipe`, plus a `· edited` marker when `editedAt` is set.
* **Refused images**: if the server refuses a send with 409 `Media.RefusedByRecipient` (the
  recipient declined that exact image before), the composer shows its own banner — "This image
  can't be sent to this conversation. Remove it, or send your message without it." Never the
  generic "try again", which would be false: the same image is refused identically every time.
  The typed text is kept and the attachment is cleared, because the server soft-deletes the
  upload while refusing it. Matched on the error code, not the 409 status, which is also used by
  the edit-conflict path.
* **Hide**: on somebody else's message, next to Report. Removes the bubble from your thread
  only — they keep their copy, and are not told you removed it. Any image involved is recorded as
  refused between you, so it cannot come back. No confirmation dialog, because unlike Delete
  nothing is destroyed — their copy survives either way. It is still PERMANENT for you: there is
  no unhide in this version, so it says so rather than letting someone find out later. Not offered on your own messages: there is nothing to withdraw from your
  own view that Delete does not already do.
* **Conversation search**: a search box above the thread. Results **replace** the timeline while
  active rather than floating over it — they are newest-first and are not in the conversation's
  order, so interleaving them would misstate where they sit. Says "No messages match …" only once a
  search has actually run, so an empty state is never confused with an unsearched thread. Typing is
  debounced, and a slow response for an older term cannot overwrite a newer one. Text only.
  Results are clickable: tapping one opens the conversation at that message, with 25 either side,
  the jumped-to bubble outlined, a "Newer messages" button when the window stops short of the
  present, and a persistent "Viewing an older part of this conversation / Back to latest" banner —
  without which a conversation that stops mid-history just looks like it ended.
* **Date dividers**: a rule between calendar days, labelled Today / Yesterday / weekday / date.
  Midnight is a real boundary — 23:50 and 00:10 get two dividers even though they are two hours
  apart. Resolved from your clock, so "Today" means your today.
* **Scroll behaviour**: the thread opens at the newest message; loading older messages holds your
  position instead of shoving what you were reading off the screen; a new message only auto-scrolls
  if you were already at the bottom, otherwise a sticky "N new messages" button appears and clears
  when you go and read it.
* **Footer**: a quiet centred line crediting the DNS provider (FreeDNS asked for a link back). On every authenticated page via the shell; not on the guest auth pages, which sit outside it.
* **Unread badge in the nav**: a count next to Messages, summed across conversations and capped at
  99+. Deliberately separate from the notification bell — the bell says "something is new", this
  says how much. Reading a thread clears its count; a message arriving in the open thread does not
  count as unread.
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

Report dialog (post/profile/message/media triggers): `POST /posts/{id}/report`,
`POST /users/{username}/report`, `POST /conversations/{id}/messages/{messageId}/report`,
`POST /media/{id}/report` — 9 fixed categories, optional note, "thank you + what
happens next" success state. One `ReportTarget` union drives all four; the dialog
itself is target-agnostic.

Category "Flashing lights or intense motion" doubles as the sensitive-visual one,
so a motion report has somewhere to land. Reporting with it also gates the image
immediately (server-side), before a moderator triages it.

Media is reportable from a DM bubble as "Report image", separately from "Report"
on the message: removing a message drops the bubble but leaves the media row
re-sendable, so the two are not interchangeable.

Safety self-declaration (post composer + DM composer) is one shared
`fc-safety-declaration`, shown only in the no-attachment state — the flags ride
with the upload request, so it must be ticked *before* a file is chosen.

**The placeholder is server-driven.** Flagged media arrives with an empty
`variants` array — the API withholds the URLs on every surface — so
`MediaViewer` shows "Sensitive media" because there is nothing to render, not
because it read a flag. Consent is `POST /media/{id}/reveal`, authorized
server-side against the attachment. Readers who turned "Hide flashing media"
**off** are auto-consented rather than prompted; a refusal renders "Media
unavailable" and is not retryable. Consequence: a client bug now yields a broken
image, never an unsafely-shown one.

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
