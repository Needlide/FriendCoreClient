'use strict';

/**
 * Production web server for the FriendCore SPA.
 *
 * Two jobs, both on purpose:
 *   1. Serve the built Angular app (dist/friendcore-client/browser) with an SPA history
 *      fallback, the way `serve -s` did.
 *   2. Reverse-proxy /api and /hubs to the API origin so the browser only ever talks to
 *      THIS origin.
 *
 * Why the proxy: the refresh token lives in the `fc_refresh` cookie, which the API sets as
 * SameSite=Strict. `*.herokuapp.com` is on the Public Suffix List, so two Heroku apps are
 * cross-site, and a Strict cookie never flows between them. Proxying keeps client and API
 * same-origin from the browser's point of view, with no custom domain and no server change.
 *
 * Config:
 *   PORT        Heroku provides it; defaults to 4200 for local runs.
 *   API_ORIGIN  Public origin of the API. Set as a Heroku config var on the client app.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const httpProxy = require('http-proxy');

const PORT = Number(process.env.PORT || 4200);
const API_ORIGIN = (process.env.API_ORIGIN || 'https://friend-core-f2ac29d531f0.herokuapp.com').replace(
  /\/+$/,
  '',
);

const DIST = path.join(__dirname, 'dist', 'friendcore-client', 'browser');
const INDEX = path.join(DIST, 'index.html');

if (!fs.existsSync(INDEX)) {
  console.error(`server: no build at ${INDEX} — run "npm run build" first.`);
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

const proxy = httpProxy.createProxyServer({
  target: API_ORIGIN,
  changeOrigin: true,
  secure: true,
  ws: true,
});

proxy.on('error', (err, req, res) => {
  console.error(`server: proxy error for ${req.url}: ${err.message}`);
  // res is an http.ServerResponse for web requests, a net.Socket for upgrades.
  if (res && typeof res.writeHead === 'function' && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad gateway');
  } else if (res && typeof res.destroy === 'function') {
    res.destroy();
  }
});

const isApiPath = (url) =>
  url === '/api' || url.startsWith('/api/') || url === '/hubs' || url.startsWith('/hubs/');

// Proxy API and realtime-hub traffic. No body parser is installed: the request stream is
// forwarded untouched. Incoming headers (cookies, X-Forwarded-For, Authorization) pass
// through, so the API still sees the real visitor IP for its per-user rate limit.
app.use((req, res, next) => {
  if (isApiPath(req.url)) {
    proxy.web(req, res);
    return;
  }
  next();
});

// Local health probe for the client app itself (does not hit the API).
app.get('/health', (_req, res) => res.json({ name: 'FriendCore web client', status: 'running' }));

app.use(
  express.static(DIST, {
    index: false,
    setHeaders(res, filePath) {
      if (filePath === INDEX) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.[0-9a-f]{8,}\./i.test(path.basename(filePath))) {
        // Angular emits content-hashed bundles; they can be cached forever.
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);

// SPA history fallback: only GET/HEAD navigations. Unknown non-HTML requests fall through to
// a JSON 404, so a mistyped API path never returns index.html with a 200.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (!req.accepts('html')) return next();
  res.sendFile(INDEX);
});

app.use((_req, res) => {
  res.status(404).json({ code: 'NotFound', description: 'Not found.' });
});

// SignalR WebSocket upgrade (e.g. /hubs/notifications?id=...&access_token=...).
server.on('upgrade', (req, socket, head) => {
  if (req.url && (req.url.startsWith('/hubs/') || req.url === '/hubs')) {
    proxy.ws(req, socket, head);
    return;
  }
  socket.destroy();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`server: listening on :${PORT}`);
  console.log(`server: serving ${DIST}`);
  console.log(`server: proxying /api and /hubs -> ${API_ORIGIN}`);
});
