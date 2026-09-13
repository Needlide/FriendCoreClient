import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard, guestGuard } from './auth.guard';
import { configureAuthTestBed, expectApi } from '../../features/auth/test-utils';

describe('guards', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let router: Router;

  const session = {
    accessToken: 'token',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: 'u1',
    username: 'alice',
    displayName: 'Alice',
    isEmailVerified: true,
  };

  beforeEach(async () => {
    // configureAuthTestBed already provides a (routeless) router — guards return
    // trees without navigating, so no routes are needed.
    await configureAuthTestBed([]);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  function signIn() {
    auth.login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(session);
  }

  it('authGuard lets signed-in users through', () => {
    signIn();
    expect(TestBed.runInInjectionContext(() => authGuard(null as never, null as never))).toBe(true);
  });

  it('authGuard redirects guests to /auth/login', () => {
    const result = TestBed.runInInjectionContext(() => authGuard(null as never, null as never));
    expect(result).toEqual(router.createUrlTree(['/auth/login']));
  });

  it('guestGuard keeps signed-in users off guest pages', () => {
    signIn();
    const result = TestBed.runInInjectionContext(() => guestGuard(null as never, null as never));
    expect(result).toEqual(router.createUrlTree(['/']));
  });

  it('guestGuard lets guests through', () => {
    expect(TestBed.runInInjectionContext(() => guestGuard(null as never, null as never))).toBe(
      true,
    );
  });
});
