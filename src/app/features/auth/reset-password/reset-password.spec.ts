import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { vi } from 'vitest';
import { ResetPassword } from './reset-password';
import { configureAuthTestBed, expectApi } from '../test-utils';

describe('ResetPassword', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([ResetPassword]);
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        paramMap: convertToParamMap({}),
        snapshot: { queryParamMap: convertToParamMap({ token: 'reset-token' }) },
      },
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(ResetPassword);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('posts the token with the new password and routes to login', () => {
    vi.useFakeTimers();
    try {
      const { fixture, el } = create();
      const input = el.querySelector('input')!;
      input.value = 'brand-new-password-1';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      el.querySelector('form')!.requestSubmit();

      const req = expectApi(http, '/api/v1/auth/reset-password');
      expect(req.request.body).toEqual({
        token: 'reset-token',
        newPassword: 'brand-new-password-1',
      });
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      req.flush(null);
      fixture.detectChanges();
      expect(el.textContent).toContain('Password changed');
      vi.advanceTimersByTime(2000);
      expect(navigate).toHaveBeenCalledWith(['/auth/login']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a calm error when the token is rejected', () => {
    const { fixture, el } = create();
    const input = el.querySelector('input')!;
    input.value = 'brand-new-password-1';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector('form')!.requestSubmit();

    expectApi(http, '/api/v1/auth/reset-password').flush(
      [{ code: 'User.InvalidResetToken', description: 'Reset link is invalid or has expired.' }],
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Reset link is invalid or has expired.',
    );
  });
});
