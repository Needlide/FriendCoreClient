import type { Environment } from './environment.model';

/**
 * Default (production) environment. The development build replaces this file with
 * `environment.development.ts` via the `fileReplacements` entry in angular.json.
 *
 * Production assumes the recommended same-registrable-domain layout
 * (app.friendcore.com + api.friendcore.com) so the SameSite=Strict refresh cookie
 * and simple CORS keep working. See the integration guide §8 (Production notes).
 */
export const environment: Environment = {
  production: true,
  apiBaseUrl: 'https://api.friendcore.com',
  apiPrefix: '/api/v1',
};
