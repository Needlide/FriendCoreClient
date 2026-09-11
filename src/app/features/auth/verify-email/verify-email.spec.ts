import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { VerifyEmail } from './verify-email';
import { configureAuthTestBed, expectApi } from '../test-utils';
import { vi } from 'vitest';

describe('VerifyEmail', () => {
  let http: HttpTestingController;

  const session = {
    accessToken: 'token',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: '01J0000000000000000000000',
    username: 'alice',
    displayName: 'Alice',
    isEmailVerified: true,
  };

  async function setup(token: string | null) {
    await configureAuthTestBed([VerifyEmail]);
    // Re-provide the route snapshot per test (the component reads ?token= in its
    // constructor and fires exactly once — no button, no retry loop).
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(VerifyEmail);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => http.verify());

  it('verifies with the token from the URL and shows success', async () => {
    const { fixture, el } = await setup('mail-token');
    const req = expectApi(http, '/api/v1/auth/verify-email');
    expect(req.request.body).toEqual({ token: 'mail-token' });
    req.flush(session);
    fixture.detectChanges();
    expect(el.textContent).toContain('Verified');
  });

  it('shows a calm failure when the token is rejected', async () => {
    const { fixture, el } = await setup('stale-token');
    expectApi(http, '/api/v1/auth/verify-email').flush(
      [{ code: 'User.InvalidVerificationToken', description: 'Verification link is invalid.' }],
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Verification link is invalid.',
    );
  });

  it('sends no request without a token', async () => {
    const { el } = await setup(null);
    http.expectNone((req) => req.url.endsWith('/api/v1/auth/verify-email'));
    expect(el.textContent).toContain('No verification token');
  });

  it('navigates home shortly after success', async () => {
    vi.useFakeTimers();
    try {
      await setup('mail-token');
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      expectApi(http, '/api/v1/auth/verify-email').flush(session);
      vi.advanceTimersByTime(1500);
      expect(navigate).toHaveBeenCalledWith(['/']);
    } finally {
      vi.useRealTimers();
    }
  });
});
