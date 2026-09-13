import { HttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { configureAuthTestBed } from '../../features/auth/test-utils';

/**
 * The 401-retry half of single-flight: a protected call that 401s awaits the ONE
 * shared refresh, then retries once with the new bearer. If the refresh itself
 * fails, the session clears (hard logout) and the original 401 propagates.
 */
describe('authInterceptor', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let client: HttpClient;

  const session = (accessToken: string) => ({
    accessToken,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: 'u1',
    username: 'alice',
    displayName: 'Alice',
    isEmailVerified: true,
  });

  beforeEach(async () => {
    await configureAuthTestBed([]);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    client = TestBed.inject(HttpClient);
    auth.login({ username: 'alice', password: 'password123' }).subscribe();
    http.expectOne((r) => r.url.endsWith('/auth/login')).flush(session('old'));
  });

  afterEach(() => http.verify());

  it('retries once with the fresh bearer after a 401', async () => {
    const pending = firstValueFrom(client.get('/api/v1/feed/home'));
    http
      .expectOne((r) => r.url.endsWith('/feed/home'))
      .flush(null, {
        status: 401,
        statusText: 'x',
      });

    // The single shared refresh fires…
    const refresh = http.expectOne((r) => r.url.endsWith('/auth/refresh'));
    refresh.flush(session('new'));

    // …and the original request retries with the new token.
    const retry = http.expectOne((r) => r.url.endsWith('/feed/home'));
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush({ posts: [], nextCursor: null });
    await expect(pending).resolves.toEqual({ posts: [], nextCursor: null });
  });

  it('clears the session when the refresh itself fails', async () => {
    const pending = firstValueFrom(client.get('/api/v1/feed/home').pipe());
    pending.catch(() => undefined);
    http
      .expectOne((r) => r.url.endsWith('/feed/home'))
      .flush(null, {
        status: 401,
        statusText: 'x',
      });

    http
      .expectOne((r) => r.url.endsWith('/auth/refresh'))
      .flush(null, {
        status: 401,
        statusText: 'x',
      });
    await expect(pending).rejects.toBeTruthy();
    expect(auth.isAuthenticated()).toBe(false);
  });
});
