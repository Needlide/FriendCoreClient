/**
 * Auth contracts. These mirror the API exactly (System.Text.Json camelCases property
 * names), so do not rename fields.
 */

/**
 * Body returned by register / login / verify-email / refresh.
 * The refresh token is NOT here — it rides in the HttpOnly `fc_refresh` cookie.
 */
export interface AuthResponse {
  accessToken: string;
  /** ISO-8601 instant the access token expires (server JWT lifetime, ~60 min). */
  expiresAt: string;
  /** Ulid as an opaque string — never parse, sort, or generate client-side. */
  userId: string;
  username: string;
  displayName: string;
  isEmailVerified: boolean;
}

/**
 * The in-memory session. Identical shape to {@link AuthResponse}; kept as its own type
 * so app code depends on a "session" concept rather than the wire DTO.
 */
export type Session = AuthResponse;

/** POST /api/v1/auth/register */
export interface RegisterRequest {
  username: string;
  displayName: string;
  email: string;
  password: string;
}

/** POST /api/v1/auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}
