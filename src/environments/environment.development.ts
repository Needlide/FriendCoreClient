import type { Environment } from './environment.model';

/**
 * Local development environment.
 *
 * - The SPA dev server runs on http://localhost:3000 (see angular.json), which is the
 *   API's default dev CORS origin (Program.cs falls back to http://localhost:3000).
 * - The API instance runs at http://localhost:5024 (ASP.NET Core via Rider).
 *   localhost:3000 and localhost:5024 are the same *site* (ports don't change "site"),
 *   so the SameSite=Strict `fc_refresh` cookie flows across ports. Keep dev on plain
 *   HTTP: the cookie's Secure flag is `Request.IsHttps`, so HTTPS would drop it locally.
 */
export const environment: Environment = {
  production: false,
  apiBaseUrl: 'http://localhost:5024',
  apiPrefix: '/api/v1',
};
