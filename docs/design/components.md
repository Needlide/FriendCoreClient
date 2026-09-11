# Component Inventory

> Reusable UI kit for FriendCore. Build in Figma (**Components** + **Patterns** pages), implement as Angular standalone components with selector prefix `fc-`.  
> Tokens: [`design-system.md`](design-system.md) · Screens that use these: [`screens.md`](screens.md)

Legend for accessibility columns:
- **Role** — ARIA role or semantic HTML element
- **Label** — how the control gets its accessible name
- **Keyboard** — expected key behaviour
- **Focus** — focus management notes

---

## 1. Primitives

### Button

| Property | Values |
|---|---|
| **Figma component** | `Button / Primary`, `Button / Secondary`, `Button / Danger` |
| **Angular selector** | `fc-button` |
| **Variants** | `variant`: primary \| secondary \| danger · `size`: md \| sm · `disabled`, `loading` |
| **States** | default, hover, focus, disabled, loading (spinner replaces label or sits beside) |

| A11y | Requirement |
|---|---|
| Role | `<button type="button|submit">` — never `<div>` |
| Label | Visible text or `aria-label` for icon-only |
| Keyboard | `Enter` / `Space` activates |
| Focus | Visible `:focus-visible` ring (global style) |

---

### IconButton

| Property | Values |
|---|---|
| **Figma** | `IconButton` |
| **Angular** | `fc-icon-button` |
| **Variants** | `size`: md (40×40) \| sm (32×32) |
| **States** | default, hover, focus, disabled |

| A11y | Requirement |
|---|---|
| Role | `<button>` |
| Label | **Required** `aria-label` (no visible text) |
| Keyboard | Enter / Space |
| Focus | Visible ring; min 44×44px touch target on mobile |

---

### TextField

| Property | Values |
|---|---|
| **Figma** | `TextField` |
| **Angular** | `fc-text-field` |
| **Variants** | `state`: empty \| filled \| error \| disabled |
| **States** | with/without helper text |

| A11y | Requirement |
|---|---|
| Role | `<label>` + `<input>` linked via `for`/`id` |
| Label | Persistent visible label (not placeholder-only) |
| Keyboard | Standard text input |
| Focus | Label click focuses input; error linked via `aria-describedby` |

---

### TextArea

Same as TextField; `fc-text-area`, `<textarea>`, resizable vertically optional.

---

### Toggle

| Property | Values |
|---|---|
| **Figma** | `Toggle` |
| **Angular** | `fc-toggle` |
| **Variants** | on, off, disabled |

| A11y | Requirement |
|---|---|
| Role | `<button role="switch">` or `<input type="checkbox" role="switch">` |
| Label | Visible label + `aria-checked` |
| Keyboard | Space toggles |
| Focus | Visible ring |

---

### Checkbox / Radio

| Figma | `Checkbox`, `Radio` |
| **Angular** | `fc-checkbox`, `fc-radio` |
| Use | Forms, report category picker (radio group) |

| A11y | Requirement |
|---|---|
| Role | Native `<input type="checkbox|radio">` |
| Label | `<label>` wrapping or `for`/`id` |
| Keyboard | Space (checkbox); arrow keys within radio group |
| Focus | Visible ring on input |

---

### Select

| **Angular** | `fc-select` |
| **Variants** | closed, open, disabled, error |

| A11y | Requirement |
|---|---|
| Role | `<select>` or custom listbox with `role="listbox"` |
| Label | Persistent label; `aria-expanded` when custom |
| Keyboard | Arrow keys, Enter to select, Escape to close |
| Focus | Trap focus in open dropdown (if custom) |

---

### Tag / Chip

| **Figma** | `Tag / Chip` |
| **Angular** | `fc-tag` |
| **Variants** | default, selected, removable (+ dismiss button) |

| A11y | Requirement |
|---|---|
| Role | `<span>` or `<button>` if clickable |
| Label | Tag text; dismiss button needs `aria-label="Remove {tag}"` |
| Keyboard | Enter/Space on interactive chips |

---

### Avatar

| **Figma** | `Avatar` sm/md/lg |
| **Angular** | `fc-avatar` |
| **Variants** | image, initials fallback, placeholder |

| A11y | Requirement |
|---|---|
| Role | `<img alt="{displayName}'s avatar">` or decorative with `alt=""` if name shown beside |
| Label | Meaningful `alt` when standalone |

---

### Card

| **Figma** | `Card` |
| **Angular** | `fc-card` |
| **Variants** | static, interactive (clickable entire card) |

| A11y | Requirement |
|---|---|
| Role | `<article>` or `<div>`; if clickable, use `<a>` or `<button>` wrapper |
| Keyboard | Enter on interactive cards |

---

### Pill / Badge

| **Figma** | `Pill / Badge` |
| **Angular** | `fc-pill` |
| **Variants** | neutral, success, danger, warning |

Decorative when adjacent to explanatory text; use `aria-label` if standalone status.

---

### Spinner

| **Angular** | `fc-spinner` |
| **Variants** | sm, md |

| A11y | Requirement |
|---|---|
| Role | `role="status"` |
| Label | `aria-label="Loading"` or visually hidden text |
| Motion | Respect reduced-motion (static arc or hidden) |

---

### Skeleton

| **Angular** | `fc-skeleton` |
| **Variants** | line, rect, circle |

| A11y | Requirement |
|---|---|
| Role | `aria-hidden="true"` on skeleton; real content replaces it |
| Motion | No shimmer when reduced-motion |

---

### EmptyState

| **Figma** | `EmptyState` |
| **Angular** | `fc-empty-state` |
| **Slots** | icon, heading, description, optional action button |

| A11y | Requirement |
|---|---|
| Role | Region with heading (`h2`/`h3`) |
| Label | Heading describes the empty context |

---

### Toast

| **Figma** | `Toast` |
| **Angular** | `fc-toast` |
| **Variants** | info, success, error |
| **Behaviour** | Auto-dismiss ~5s; pauses on hover; stack max 3 |

| A11y | Requirement |
|---|---|
| Role | `role="status"` (info/success) or `role="alert"` (error) |
| Label | Message text; dismiss button labelled |
| Keyboard | Escape dismisses focused toast |
| Motion | No slide animation when reduced-motion |

---

### Modal

| **Figma** | `Modal` |
| **Angular** | `fc-modal` |
| **Anatomy** | overlay, title, body, primary + secondary actions |

| A11y | Requirement |
|---|---|
| Role | `role="dialog" aria-modal="true"` |
| Label | `aria-labelledby` → title id |
| Keyboard | Escape closes; focus trapped inside; restore focus on close |
| Focus | Move focus to dialog on open (title or first focusable) |

---

### Sheet (mobile)

Bottom sheet variant of Modal for mobile actions/menus. Same a11y as Modal; swipe-to-dismiss optional but must have button alternative.

---

## 2. Domain / pattern components

### PostCard

| **Figma** | `PostCard` (Patterns) |
| **Angular** | `fc-post-card` |
| **Content** | author (avatar + name + @username), relative time, text, media (medium variant), like count, comment count, actions |
| **States** | default, liked (by viewer), loading skeleton |

| A11y | Requirement |
|---|---|
| Role | `<article>` |
| Label | Author name in heading; time in `<time datetime="...">` |
| Keyboard | Action buttons focusable in logical order |

---

### PostComposer

| **Figma** | `PostComposer` |
| **Angular** | `fc-post-composer` |
| **States** | idle, uploading, processing, ready-to-post, error, blocked-unverified |

| A11y | Requirement |
|---|---|
| Role | `<form>` |
| Label | TextArea labelled "What's on your mind?" or similar |
| Keyboard | Ctrl/Cmd+Enter to submit (optional, documented) |

---

### MediaUploader

| **Angular** | `fc-media-uploader` |
| **States** | idle, uploading (%), processing (poll), ready, failed |
| **API** | `POST /api/v1/media` → poll `GET /api/v1/media/{id}/status` |

Includes checkboxes: "Contains flashing lights", "Contains intense motion" (`HasFlashingWarning`, `HasIntenseMotionWarning`).

---

### MediaViewer

| **Angular** | `fc-media-viewer` |
| **States** | **safe-placeholder** (warning + "Show media" — image NOT loaded), revealed, loading, error |

Critical: when `HideFlashingMedia && HasFlashingWarning`, placeholder must not load `<img src>` until user clicks.

---

### TagInput

| **Angular** | `fc-tag-input` |
| **Behaviour** | Debounced autocomplete 200–300ms → `GET /api/v1/tags/autocomplete?q=` |
| **States** | typing, suggestions open, tag added, limit reached, "first to use this tag" |

| A11y | Requirement |
|---|---|
| Role | Combobox pattern: `role="combobox"`, `aria-expanded`, listbox for suggestions |
| Keyboard | Arrow keys in list, Enter to select, Backspace removes last tag |

---

### UserCard

| **Figma** | `UserCard` |
| **Angular** | `fc-user-card` |
| **Content** | avatar, display name, @username, shared tag chips, follow button |
| **Variants** | discovery, follower list, suggested follow |

---

### FollowButton

| **Angular** | `fc-follow-button` |
| **States** | follow, following, loading, disabled (blocked/self) |
| **API** | `POST/DELETE /api/v1/users/{username}/follow` |

| A11y | Requirement |
|---|---|
| Label | "Follow {username}" / "Unfollow {username}" |

---

### BlockMuteMenu

| **Angular** | `fc-block-mute-menu` |
| **Trigger** | IconButton or menu item on profile |
| **Actions** | Block, Unblock, Mute, Unmute, Report |
| **API** | block/mute endpoints; block may need confirm modal |

---

### ConversationList / ConversationRow

| **Angular** | `fc-conversation-list`, `fc-conversation-row` |
| **Content** | counterpart avatar/name, last message preview, time, unread indicator |
| **States** | default, unread, active (selected), empty list |

---

### MessageThread / MessageBubble

| **Angular** | `fc-message-thread`, `fc-message-bubble` |
| **Variants** | sent (accent bg), received (surface-2) |
| **States** | sending, sent, failed-to-send |
| **Realtime** | Reconcile on `RealtimeService.resync$` |

| A11y | Requirement |
|---|---|
| Role | `<ul>` / `<li>` or log `role="log" aria-live="polite"` for new messages |
| Label | Sender name on received bubbles if not obvious |

---

### MessageComposer

| **Angular** | `fc-message-composer` |
| **API** | `POST /api/v1/conversations/{id}/messages` |

---

### NotificationItem / NotificationBell

| **Angular** | `fc-notification-item`, `fc-notification-bell` |
| **Behaviour** | Quiet numeric badge (no pulse animation); reconcile via REST on push |
| **Types** | NewFollower, NewLike, NewComment, NewMessage |

| A11y | Requirement |
|---|---|
| Role | Bell: `aria-label="Notifications, {n} unread"` |
| Label | Each item describes actor + action in text |

---

### ReportDialog

| **Angular** | `fc-report-dialog` |
| **Categories** | 9 user-facing report categories (see [`content-and-a11y.md`](content-and-a11y.md)) |
| **API** | `POST /api/v1/posts/{id}/report` (and equivalents) |

Radio group for category; optional note field; submit + cancel.

---

### KeywordFilterEditor

| **Angular** | `fc-keyword-filter-editor` |
| **API** | `GET/PATCH /api/v1/users/me/keyword-filters` |

List of keywords with add/remove; plain explanation of effect.

---

### AppShell

| **Figma** | `AppShell / Desktop`, `AppShell / Mobile` |
| **Angular** | `fc-app-shell` |
| **Anatomy** | top bar, nav (left or bottom), main `<router-outlet>`, skip link |

| A11y | Requirement |
|---|---|
| Role | `<header>`, `<nav aria-label="Main">`, `<main id="main-content">` |
| Label | "Skip to content" link as first focusable element |
| Keyboard | Nav items reachable by Tab; current page `aria-current="page"` |

---

### PreferencesPanel

| **Angular** | `fc-preferences-panel` |
| **Toggles** | HideFlashingMedia, ReduceMotion, DisableAutoplay, ReduceVisualNoise, ContentPreference |
| **API** | `PATCH /api/v1/users/me/preferences` |

Each toggle explains what it does in plain language beside the control.

---

## 3. Component build order (Angular)

Built as of Sep 2026 (in `src/app/features/`): PostCard, PostComposer (`fc-composer`),
MediaViewer, TagInput, UserCard, FollowButton, BlockMuteMenu, ConversationList,
MessageThread/MessageComposer (thread page), NotificationBell, ReportDialog,
KeywordFilterEditor, PreferencesPanel (preferences page), AppShell (`fc-shell`).

Deliberate deviations from the kit above: primitives were NOT built as standalone
components (native elements + tokens per screen — a rename later, not a restyle);
Toast replaced by inline banners; CommentList waits for the post-detail page;
MediaUploader lives inside the composer; NotificationItem renders inside the
notifications page.

---

## 4. Figma ↔ Angular naming map

| Figma component name | Angular selector |
|---|---|
| `Button / Primary` | `fc-button[variant="primary"]` |
| `PostCard` | `fc-post-card` |
| `AppShell / Desktop` | `fc-app-shell` (responsive, not two components) |

Keep names aligned so Dev Mode inspection maps cleanly to the codebase.
