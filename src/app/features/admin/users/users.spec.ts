import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Users } from './users';
import { configureAuthTestBed, expectApi } from '../../auth/test-utils';

const account = {
  userId: 'u1',
  username: 'badactor',
  displayName: 'Bad Actor',
  role: 'User',
  isVerified: false,
  isBanned: false,
  suspendedUntil: null,
  createdAt: new Date().toISOString(),
  moderationHistory: [
    {
      id: 'h1',
      moderator: { userId: 'm1', username: 'mod1', displayName: 'Mod One', isVerified: true },
      action: 'Warning',
      targetType: 'User',
      targetId: 'u1',
      reason: 'Spammy posts in discovery.',
      ipAddress: '10.0.0.1',
      relatedReportId: 'r1',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
  ],
};

describe('Users', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([Users]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Users);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('looks up a user account and shows enforcement state', () => {
    const { fixture, el } = create();
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'badactor';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const buttons = Array.from(el.querySelectorAll('button'));
    const lookupBtn = buttons.find((b) => b.textContent?.trim() === 'Look up');
    (lookupBtn as HTMLButtonElement).click();
    fixture.detectChanges();

    const req = expectApi(http, '/admin/users/badactor');
    req.flush(account);
    fixture.detectChanges();

    expect(el.textContent).toContain('badactor');
    expect(el.textContent).toContain('Bad Actor');
    expect(el.textContent).toContain('Warning');
    expect(el.textContent).toContain('mod1');
  });

  it('shows 404 when user not found', () => {
    const { fixture, el } = create();
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'nonexistent';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const buttons = Array.from(el.querySelectorAll('button'));
    const lookupBtn = buttons.find((b) => b.textContent?.trim() === 'Look up');
    (lookupBtn as HTMLButtonElement).click();
    fixture.detectChanges();

    expectApi(http, '/admin/users/nonexistent').flush(null, { status: 404, statusText: 'x' });
    fixture.detectChanges();

    expect(el.textContent).toContain('Not found');
  });

  it('acts on a user (temporary suspension)', () => {
    const { fixture, el } = create();
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'badactor';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const buttons = Array.from(el.querySelectorAll('button'));
    const lookupBtn = buttons.find((b) => b.textContent?.trim() === 'Look up');
    (lookupBtn as HTMLButtonElement).click();
    fixture.detectChanges();

    expectApi(http, '/admin/users/badactor').flush(account);
    fixture.detectChanges();

    // Select TemporarySuspension so the days input appears
    const selects = el.querySelectorAll('select');
    const actionSelect = selects[0] as HTMLSelectElement;
    actionSelect.value = 'TemporarySuspension';
    actionSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const daysInput = el.querySelector('input[type="number"]') as HTMLInputElement;
    expect(daysInput).not.toBeNull();
    daysInput.value = '7';
    daysInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const reason = el.querySelector('textarea') as HTMLTextAreaElement;
    reason.value = 'Repeated harassment after warning.';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const formButtons = Array.from(el.querySelectorAll('.form-actions button'));
    const actBtn = formButtons.find((b) => b.textContent?.trim() === 'Take action');
    (actBtn as HTMLButtonElement).click();
    fixture.detectChanges();

    const req = expectApi(http, '/admin/users/badactor/action');
    expect(req.request.body).toEqual({
      action: 'TemporarySuspension',
      reason: 'Repeated harassment after warning.',
      suspensionDays: 7,
    });
    req.flush(null);
    // The component re-looks-up the user after acting; flush that too.
    expectApi(http, '/admin/users/badactor').flush(account);
    fixture.detectChanges();
  });

  it('requires a reason before acting', () => {
    const { fixture, el } = create();
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'badactor';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const buttons = Array.from(el.querySelectorAll('button'));
    const lookupBtn = buttons.find((b) => b.textContent?.trim() === 'Look up');
    (lookupBtn as HTMLButtonElement).click();
    fixture.detectChanges();

    expectApi(http, '/admin/users/badactor').flush(account);
    fixture.detectChanges();

    const formButtons = Array.from(el.querySelectorAll('.form-actions button'));
    const actBtn = formButtons.find((b) => b.textContent?.trim() === 'Take action');
    (actBtn as HTMLButtonElement).click();
    fixture.detectChanges();

    http.expectNone((req) => req.url.endsWith('/action'));
  });

  it('changes a user role', () => {
    const { fixture, el } = create();
    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'badactor';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const buttons = Array.from(el.querySelectorAll('button'));
    const lookupBtn = buttons.find((b) => b.textContent?.trim() === 'Look up');
    (lookupBtn as HTMLButtonElement).click();
    fixture.detectChanges();

    expectApi(http, '/admin/users/badactor').flush(account);
    fixture.detectChanges();

    const selects = el.querySelectorAll('select');
    const roleSelect = selects[1] as HTMLSelectElement;
    roleSelect.value = 'Moderator';
    roleSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const textareas = el.querySelectorAll('textarea');
    const reason = textareas[1] as HTMLTextAreaElement;
    reason.value = 'Trusted contributor, helping with reports.';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const roleButtons = Array.from(el.querySelectorAll('.role-actions .form-actions button'));
    const changeBtn = roleButtons.find((b) => b.textContent?.trim() === 'Change role');
    (changeBtn as HTMLButtonElement).click();
    fixture.detectChanges();

    const req = expectApi(http, '/admin/users/badactor/role');
    expect(req.request.body).toEqual({
      role: 'Moderator',
      reason: 'Trusted contributor, helping with reports.',
    });
    req.flush(null);
    // The component re-looks-up the user after a role change; flush that too.
    expectApi(http, '/admin/users/badactor').flush(account);
  });
});
