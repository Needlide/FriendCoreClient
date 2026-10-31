import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Appeals } from './appeals';
import { configureAuthTestBed, expectApi } from '../../auth/test-utils';

const appeals = {
  appeals: [
    {
      id: 'ap1',
      auditLogId: 'al1',
      appellant: { userId: 'u1', username: 'banneduser', displayName: 'Banned User', isVerified: false },
      reason: 'My suspension was wrongful — I never posted that.',
      status: 'Pending',
      deadline: new Date(Date.now() + 172800000).toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: 'ap2',
      auditLogId: 'al2',
      appellant: { userId: 'u2', username: 'warneduser', displayName: 'Warned User', isVerified: true },
      reason: 'The warning was for a song lyric.',
      status: 'Pending',
      deadline: new Date(Date.now() + 604800000).toISOString(),
      createdAt: new Date(Date.now() - 86400000).toISOString(),
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

  it('lists pending appeals sorted by deadline then age', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/appeals').flush(appeals);
    fixture.detectChanges();

    expect(el.textContent).toContain('banneduser');
    expect(el.textContent).toContain('warneduser');
    expect(el.textContent).toContain('My suspension was wrongful');
    expect(el.textContent).toContain('Pending');
  });

  it('shows "no pending appeals" when empty', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/appeals').flush({ appeals: [] });
    fixture.detectChanges();

    expect(el.textContent).toContain('No pending appeals');
  });

  it('reviews an appeal with an outcome and note', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/appeals').flush(appeals);
    fixture.detectChanges();

    const reviewButtons = Array.from(el.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Review',
    );
    (reviewButtons[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.textContent).toContain('My suspension was wrongful — I never posted that.');

    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'Overturned';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const note = el.querySelector('textarea') as HTMLTextAreaElement;
    note.value = 'Evidence was insufficient; reversing the suspension.';
    note.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    (el.querySelector('.fc-primary') as HTMLButtonElement).click();

    const req = expectApi(http, '/admin/appeals/ap1/review');
    expect(req.request.body).toEqual({
      outcome: 'Overturned',
      note: 'Evidence was insufficient; reversing the suspension.',
    });
    req.flush(null);
    fixture.detectChanges();

    expectApi(http, '/admin/appeals').flush({ appeals: [] });
    fixture.detectChanges();

    expect(el.textContent).toContain('No pending appeals');
  });

  it('requires a review note', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/appeals').flush(appeals);
    fixture.detectChanges();

    const reviewButtons = Array.from(el.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Review',
    );
    (reviewButtons[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    (el.querySelector('.fc-primary') as HTMLButtonElement).click();
    fixture.detectChanges();

    http.expectNone((req) => req.url.endsWith('/review'));
  });
});
