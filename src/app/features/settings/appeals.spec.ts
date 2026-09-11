import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Appeals } from './appeals';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const actions = {
  actions: [
    {
      id: 'a1',
      action: 'Warning',
      reason: 'Spammy post in discovery.',
      createdAt: new Date().toISOString(),
    },
  ],
};

describe('Appeals', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([Appeals]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Appeals);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists moderation actions with appeal buttons', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/moderation-actions').flush(actions);
    fixture.detectChanges();
    expect(el.textContent).toContain('Warning');
    expect(el.textContent).toContain('Spammy post in discovery.');
  });

  it('submits an appeal with the action id and a reason', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/moderation-actions').flush(actions);
    fixture.detectChanges();

    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Appeal')!
      .click();
    fixture.detectChanges();

    const area = el.querySelector('textarea')!;
    area.value = 'That post was a song lyric, not spam.';
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.appeal-actions .fc-primary')!.click();

    const req = expectApi(http, '/appeals');
    expect(req.request.body).toEqual({
      auditLogId: 'a1',
      reason: 'That post was a song lyric, not spam.',
    });
    req.flush(null);
    fixture.detectChanges();
    expect(el.textContent).toContain('Appeal sent');
  });

  it('shows a clean record when there are no actions', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/moderation-actions').flush({ actions: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Clean record');
  });
});
