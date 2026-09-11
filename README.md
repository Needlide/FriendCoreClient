# FriendCore web client

Angular v22 single-page app for FriendCore — a privacy-first, chronological,
follow-only social platform. Custom SCSS tokens, no component library, no trackers.

## Prerequisites

- Node 22 + npm 11 (`packageManager` field pins npm)
- The FriendCore API running locally (default `http://localhost:5024`;
  see `src/environments/environment.development.ts`). Docker setup lives in the
  API repo (`docker-compose.dev.yml`).

## Development server

```bash
npm start
```

The SPA serves on `http://localhost:3000` — this exact origin is the API's default
dev CORS origin, and the `SameSite=Strict` refresh cookie flows across ports
(same site). Keep local dev on plain HTTP: the cookie's `Secure` flag follows
`Request.IsHttps`, so local HTTPS would silently drop it.

## Build

```bash
npm run build
```

Output goes to `dist/`. Auth, onboarding, feed, discovery, and messaging routes
are lazy-loaded chunks.

## Running unit tests

```bash
npm test
```

Vitest + jsdom via `ng test`. HTTP is intercepted per-test (`HttpTestingController`);
no server or sockets needed — realtime pushes are driven by hand through Subjects.

## Docs (read in this order)

1. `docs/UI-Plan.md` — **authoritative** route table + screen→endpoint map
2. `docs/ui-design-plan.md` — philosophy, tokens direction, build order
3. `docs/design/` — Figma workflow, component kit, screen inventory, copy rules

When UI-Plan and `design/screens.md` disagree, UI-Plan wins (it is verified
against the API; `screens.md` tracks Figma).
