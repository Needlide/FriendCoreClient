import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Register } from './register';
import { configureAuthTestBed, expectApi } from '../test-utils';
import { vi } from 'vitest';

describe('Register', () => {
  let http: HttpTestingController;
  let router: Router;

  const session = {
    accessToken: 'token',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: '01J0000000000000000000000',
    username: 'alice',
    displayName: 'Alice',
    isEmailVerified: false,
  };

  beforeEach(async () => {
    await configureAuthTestBed([Register]);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  function fillAndSubmit(): { fixture: ComponentFixture<Register>; el: HTMLElement } {
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const [username, displayName, email, password] = Array.from(
      el.querySelectorAll<HTMLInputElement>('input'),
    );
    const set = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    set(username, 'alice');
    set(displayName, 'Alice');
    set(email, 'alice@example.com');
    set(password, 'password123');
    fixture.detectChanges();
    el.querySelector('form')!.requestSubmit();
    return { fixture, el };
  }

  it('shows the server description on 409 and keeps every typed value', () => {
    const { fixture, el } = fillAndSubmit();
    expectApi(http, '/api/v1/auth/register').flush(
      [{ code: 'User.UsernameAlreadyInUse', description: 'This username is already taken.' }],
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'This username is already taken.',
    );
    const values = Array.from(el.querySelectorAll<HTMLInputElement>('input')).map((i) => i.value);
    expect(values).toEqual(['alice', 'Alice', 'alice@example.com', 'password123']);
  });

  it('blocks submit client-side when the password is too short', () => {
    const fixture = TestBed.createComponent(Register);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const [, , , password] = Array.from(el.querySelectorAll<HTMLInputElement>('input'));
    password.value = 'short';
    password.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector('form')!.requestSubmit();
    fixture.detectChanges();
    http.expectNone((req) => req.url.endsWith('/api/v1/auth/register'));
    expect(el.querySelector('#register-password-error')).not.toBeNull();
  });

  it('navigates to onboarding on success (201 starts the session)', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fillAndSubmit();
    expectApi(http, '/api/v1/auth/register').flush(session, {
      status: 201,
      statusText: 'Created',
    });
    expect(navigate).toHaveBeenCalledWith(['/onboarding']);
  });
});
