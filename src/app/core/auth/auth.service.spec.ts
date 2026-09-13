import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { configureAuthTestBed, expectApi } from '../../features/auth/test-utils';

/**
 * The single most important client logic (integration guide §1): the refresh token
 * rotates on every use, and replaying a rotated token revokes the whole family.
 * These specs pin the single-flight behavior that keeps concurrent 401s from
 * logging the user out.
 */
describe('AuthService', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  const session = (overrides = {}) => ({
    accessToken: 'token',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: 'u1',
    username: 'alice',
    displayName: 'Alice',
    isEmailVerified: true,
    ...overrides,
  });

  beforeEach(async () => {
    await configureAuthTestBed([]);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  it('shares one HTTP call between concurrent refreshes (single-flight)', () => {
    let completions = 0;
    auth.refresh().subscribe(() => completions++);
    auth.refresh().subscribe(() => completions++);

    // Exactly ONE request for two subscribers — a second would replay the rotated
    // cookie and revoke the family (instant logout) on a real server.
    const req = expectApi(http, '/auth/refresh');
    req.flush(session());
    expect(completions).toBe(2);
    http.expectNone((r) => r.url.endsWith('/auth/refresh'));
  });

  it('bootstrap resolves null (not an error) when the cookie is gone', () => {
    let result: unknown = 'pending';
    auth.bootstrap().subscribe((s) => (result = s));
    expectApi(http, '/auth/refresh').flush(null, { status: 401, statusText: 'x' });
    expect(result).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('logout clears the session even when the server call fails', () => {
    auth.login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(session());
    expect(auth.isAuthenticated()).toBe(true);

    auth.logout().subscribe();
    expectApi(http, '/auth/logout').flush(null, { status: 500, statusText: 'x' });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('freshAccessToken returns the current token when far from expiry', async () => {
    auth.login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(session());

    await expect(auth.freshAccessToken()).resolves.toBe('token');
    http.expectNone((r) => r.url.endsWith('/auth/refresh'));
  });

  it('freshAccessToken refreshes through the shared path when expiring', async () => {
    auth.login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(
      session({ accessToken: 'stale', expiresAt: new Date().toISOString() }),
    );

    const pending = auth.freshAccessToken();
    expectApi(http, '/auth/refresh').flush(session({ accessToken: 'fresh' }));
    await expect(pending).resolves.toBe('fresh');
  });
});
