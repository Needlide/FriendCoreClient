import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * When true, the auth interceptor will NOT attach a bearer token and will NOT attempt
 * the single-flight refresh-and-retry on a 401. Set this on the auth endpoints
 * themselves (login, register, verify-email, refresh, logout): their 401 is a genuine
 * auth failure, not an expired access token, so retrying would be wrong (and refreshing
 * the refresh call would loop).
 */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

/** Convenience: a fresh HttpContext with SKIP_AUTH set. */
export function skipAuth(): HttpContext {
  return new HttpContext().set(SKIP_AUTH, true);
}
