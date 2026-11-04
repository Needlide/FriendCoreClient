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

## Testing from another device on your LAN (e.g. a phone)

The dev servers bind localhost only. To expose them on your home network, with
`PC_IP` = your machine's LAN address (`ip -4 addr show | grep inet`):

1. **API accepts the phone's origin and listens on all interfaces.** The phone
   arrives as `http://<PC_IP>:3000`, which is neither the default CORS origin nor
   reachable on a localhost-only socket:
   ```bash
   # in FriendCore/ — env vars only, nothing to revert in files
   Cors__AllowedOrigins__0=http://<PC_IP>:3000 \
   ASPNETCORE_URLS=http://0.0.0.0:5024 \
   dotnet run --project src/FriendCore.API --launch-profile http
   ```
2. **Point the SPA at the LAN API.** Temporarily set `apiBaseUrl` in
   `src/environments/environment.development.ts` to `http://<PC_IP>:5024`
   (revert afterwards), then:
   ```bash
   npx ng serve --host 0.0.0.0 --port 3000
   ```
3. **Images need a reachable MinIO URL.** `Storage:PublicBaseUrl` in the API's
   `appsettings.Development.json` must be `http://<PC_IP>:9000/friendcore-media`
   (revert afterwards) — `localhost:9000` would resolve to the *phone itself*.
4. **Firewall.** Allow 3000/5024/9000 inbound (e.g. `sudo ufw allow 3000,5024,9000/tcp`).
5. Open `http://<PC_IP>:3000` on the phone. Cookies still flow: same IP with
   different ports counts as same-site, so the refresh cookie works.

Revert the three temporary edits when done — they must never be committed.

## Build

```bash
npm run build
```

Output goes to `dist/`. Auth, onboarding, feed, discovery, and messaging routes
are lazy-loaded chunks.

## Deployment (Heroku)

The client is a static SPA — there is no server of its own. In production it is
served by [`serve`](https://github.com/vercel/serve) with a single-page fallback
(rewrites unknown paths to `index.html`, required for the deep-link routes).

- On deploy, Heroku runs the automatic `heroku-postbuild` script →
  `ng build --configuration production` → output in `dist/friendcore-client/browser`.
- The `Procfile` (`web: npm run serve`) starts the static server, which binds
  `$PORT` → `serve -s dist/friendcore-client/browser -l $PORT`.

Because Heroku installs dependencies with `NODE_ENV=production` (skipping
`devDependencies`), the Angular CLI toolchain (`@angular/cli`,
`@angular/build`, `@angular/compiler-cli`) must live in `dependencies` — it now
does, so the `ng` binary and the build are available during the Heroku build.

Local production check:

```bash
npm run build && npm run serve
```

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
