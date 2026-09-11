import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Login } from './login';
import { configureAuthTestBed, expectApi } from '../test-utils';
import { vi } from 'vitest';

/**
 * How to read these: HttpTestingController intercepts the outgoing HTTP call so no
 * server is needed. `flush` with a status simulates the failure path; the suite then
 * asserts the *copy rule* from content-and-a11y.md §3, not component internals.
 * (flush() delivers synchronously, so one more detectChanges() re-renders the banner.)
 */
describe('Login', () => {
  let http: HttpTestingController;
  let router: Router;

  const session = {
    accessToken: 'token',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: '01J0000000000000000000000',
    username: 'alice',
    displayName: 'Alice',
    isEmailVerified: true,
  };

  beforeEach(async () => {
    await configureAuthTestBed([Login]);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  function fillAndSubmit(): { fixture: ComponentFixture<Login>; el: HTMLElement } {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const [emailInput, passwordInput] = Array.from(el.querySelectorAll<HTMLInputElement>('input'));
    emailInput.value = 'alice@example.com';
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = 'password123';
    passwordInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector('form')!.requestSubmit();
    return { fixture, el };
  }

  it('shows "Invalid email or password." on 401', () => {
    const { fixture, el } = fillAndSubmit();
    expectApi(http, '/api/v1/auth/login').flush(null, { status: 401, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Invalid email or password.');
  });

  it('shows the unavailable-account message on 403', () => {
    const { fixture, el } = fillAndSubmit();
    expectApi(http, '/api/v1/auth/login').flush(null, { status: 403, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      "This account isn't available.",
    );
  });

  it('navigates home on success', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fillAndSubmit();
    expectApi(http, '/api/v1/auth/login').flush(session);
    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
  });

  it('keeps typed values when the server rejects the attempt', () => {
    const { el } = fillAndSubmit();
    expectApi(http, '/api/v1/auth/login').flush(null, { status: 401, statusText: 'x' });
    const [emailInput] = Array.from(el.querySelectorAll<HTMLInputElement>('input'));
    expect(emailInput.value).toBe('alice@example.com');
  });
});
