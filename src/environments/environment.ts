import type { Environment } from './environment.model';

/**
 * Default (production) environment. The development build replaces this file with
 * `environment.development.ts` via the `fileReplacements` entry in angular.json.
 *
 * `apiBaseUrl: ''` means SAME-ORIGIN: requests go to whatever host served the page (see
 * `resolveApiBaseUrl`). The intended production layout is one registrable domain serving both
 * — app.friendcore.com with the API behind it, as `Spa:Path` does now — so this needs no
 * per-environment rebuild and no CORS allowlist. Set it to an absolute URL to point a build at
 * a different API host (the README's LAN-testing instructions do exactly that).
 */
export const environment: Environment = {
  production: true,
  apiBaseUrl: '',
  apiPrefix: '/api/v1',
};
