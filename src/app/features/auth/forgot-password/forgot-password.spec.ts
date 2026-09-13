import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ForgotPassword } from './forgot-password';
import { configureAuthTestBed, expectApi } from '../test-utils';

/**
 * The blindness contract: success looks identical whether anything matched.
 * The suite asserts the request shape and the neutral copy — it cannot (and must
 * not be able to) distinguish the cases.
 */
describe('ForgotPassword', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([ForgotPassword]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function fillAndSubmit() {
    const fixture = TestBed.createComponent(ForgotPassword);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const [usernameInput, emailInput] = Array.from(el.querySelectorAll<HTMLInputElement>('input'));
    usernameInput.value = 'alice';
    usernameInput.dispatchEvent(new Event('input'));
    emailInput.value = 'alice@example.com';
    emailInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector('form')!.requestSubmit();
    return { fixture, el };
  }

  it('posts username + email and shows the neutral confirmation', () => {
    const { fixture, el } = fillAndSubmit();
    const req = expectApi(http, '/api/v1/auth/forgot-password');
    expect(req.request.body).toEqual({ username: 'alice', email: 'alice@example.com' });
    req.flush(null);
    fixture.detectChanges();
    expect(el.textContent).toContain('If they match an account');
  });
});
