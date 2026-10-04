import { environment } from '../../../environments/environment';

/**
 * The origin every API and hub request goes to.
 *
 * When `apiBaseUrl` is empty (the default for a same-origin build), requests go to whatever
 * host served the page. That is what makes ONE build portable: the same `dist/` works when
 * testers reach it at a LAN IP, a WireGuard address, or a hostname, with no rebuild per
 * environment. It also means the browser sees a same-origin request, so there is no CORS
 * preflight and `Cors:AllowedOrigins` stops being a per-environment chore.
 *
 * A non-empty `apiBaseUrl` still wins, so a dev build can point at an API on another machine
 * exactly as before (the README's LAN-testing instructions rely on that).
 *
 * Must be absolute for SignalR: `withUrl` needs a real origin to negotiate and upgrade to
 * WebSockets, and `window.location.origin` always is.
 */
export function resolveApiBaseUrl(): string {
  const configured = environment.apiBaseUrl?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  return typeof window === 'undefined' ? '' : window.location.origin;
}
