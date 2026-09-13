import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, firstValueFrom, map, of, shareReplay, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiClient } from '../api/api-client';
import { AuthEndpoints } from '../config/endpoints';
import { skipAuth } from '../http/http-context';
import {
  AuthResponse,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  Session,
} from '../models/auth.models';

/** Refresh proactively this long before the token's stated expiry (server ClockSkew = 1 min). */
const TOKEN_SKEW_MS = 60_000;

/**
 * Owns the in-memory session and the auth lifecycle. This is the single source of truth
 * for "am I logged in" and "what's my access token", and the single owner of the
 * critical single-flight refresh.
 *
 * Token storage rule (guide §1): the access token lives ONLY in memory (this signal) —
 * never localStorage/sessionStorage (XSS). A hard refresh wipes it; {@link bootstrap}
 * restores the session from the HttpOnly refresh cookie.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClient);

  private readonly _session = signal<Session | null>(null);

  /** Reactive session; `null` when signed out. */
  readonly session = this._session.asReadonly();
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly isEmailVerified = computed(() => this._session()?.isEmailVerified ?? false);

  /**
   * The one shared in-flight refresh. Every concurrent 401 (and the SignalR token
   * factory) awaits THIS — never its own /refresh — because the server rotates the
   * refresh token on each use and treats a replayed token as theft, revoking the whole
   * family (instant logout).
   */
  private refreshInFlight?: Observable<Session>;

  /** Current access token, or null when signed out. */
  accessToken(): string | null {
    return this._session()?.accessToken ?? null;
  }

  /**
   * Restores the session on app load / hard refresh: the access token is gone from
   * memory, so we POST /auth/refresh (the cookie carries the refresh token). Resolves to
   * the session on success, or `null` (→ show login) on 401.
   */
  bootstrap(): Observable<Session | null> {
    return this.refresh().pipe(catchError(() => of(null)));
  }

  register(request: RegisterRequest): Observable<Session> {
    return this.api
      .post<AuthResponse>(AuthEndpoints.register, request, { context: skipAuth() })
      .pipe(tap((session) => this._session.set(session)));
  }

  login(request: LoginRequest): Observable<Session> {
    return this.api
      .post<AuthResponse>(AuthEndpoints.login, request, { context: skipAuth() })
      .pipe(tap((session) => this._session.set(session)));
  }

  verifyEmail(token: string): Observable<Session> {
    return this.api
      .post<AuthResponse>(AuthEndpoints.verifyEmail, { token }, { context: skipAuth() })
      .pipe(tap((session) => this._session.set(session)));
  }

  /**
   * Requests a fresh verification email. The server stores no address, so the email
   * travels in the request and is hash-matched before anything is sent — a mismatch
   * is a blind success. Auth required (prevents anonymous probing).
   */
  resendVerification(email: string): Observable<void> {
    return this.api.post<void>(AuthEndpoints.resendVerification, { email });
  }

  /** Blind 204 by design — reveals nothing about whether anything matched. */
  forgotPassword(request: ForgotPasswordRequest): Observable<void> {
    return this.api.post<void>(AuthEndpoints.forgotPassword, request, { context: skipAuth() });
  }

  resetPassword(request: ResetPasswordRequest): Observable<void> {
    return this.api.post<void>(AuthEndpoints.resetPassword, request, { context: skipAuth() });
  }

  /**
   * Single-flight refresh. Returns the shared in-flight observable if one is running,
   * otherwise starts one and clears the slot when it settles.
   */
  refresh(): Observable<Session> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = this.api
      .post<AuthResponse>(AuthEndpoints.refresh, {}, { context: skipAuth() })
      .pipe(
        tap((session) => this._session.set(session)),
        finalize(() => (this.refreshInFlight = undefined)),
        shareReplay(1),
      );

    return this.refreshInFlight;
  }

  /**
   * A guaranteed-fresh access token for the SignalR accessTokenFactory. Refreshes
   * (through the single-flight path) when the current token is at/near expiry — the
   * factory is re-invoked on every (re)connect and a stale token makes the reconnect 401.
   */
  async freshAccessToken(): Promise<string> {
    const session = this._session();
    if (session && !this.isExpiring(session)) return session.accessToken;
    const refreshed = await firstValueFrom(this.refresh());
    return refreshed.accessToken;
  }

  /** Best-effort, idempotent server logout, then clears local state regardless. */
  logout(): Observable<void> {
    return this.api.post<void>(AuthEndpoints.logout, {}, { context: skipAuth() }).pipe(
      catchError(() => of(void 0)),
      map(() => void 0),
      finalize(() => this.clearSession()),
    );
  }

  /** Drops the in-memory session (callers should also tear down SignalR). */
  clearSession(): void {
    this._session.set(null);
  }

  private isExpiring(session: Session): boolean {
    const expiresAt = Date.parse(session.expiresAt);
    if (Number.isNaN(expiresAt)) return true;
    return Date.now() >= expiresAt - TOKEN_SKEW_MS;
  }
}
