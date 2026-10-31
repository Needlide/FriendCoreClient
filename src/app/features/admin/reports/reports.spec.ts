import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Reports } from './reports';
import { configureAuthTestBed, expectApi } from '../../auth/test-utils';

const reports = {
  reports: [
    {
      id: 'r1',
      targetType: 'Post',
      targetId: 'p1',
      category: 'Harassment',
      priority: 'High',
      status: 'Pending',
      note: 'This user is targeting me.',
      reporter: { userId: 'u1', username: 'reporter1', displayName: 'Reporter One', isVerified: false },
      subject: {
        kind: 'Post',
        content: 'You are worthless and I will find you.',
        authorUsername: 'badactor',
        capturedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
    },
    {
      id: 'r2',
      targetType: 'User',
      targetId: 'u2',
      category: 'Spam',
      priority: 'Low',
      status: 'Pending',
      note: null,
      reporter: { userId: 'u3', username: 'reporter2', displayName: 'Reporter Two', isVerified: true },
      subject: null,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ],
};

describe('Reports', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([Reports]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Reports);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists pending reports sorted by priority then age', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/reports').flush(reports);
    fixture.detectChanges();

    expect(el.textContent).toContain('Harassment');
    expect(el.textContent).toContain('Spam');
    expect(el.textContent).toContain('High');
    expect(el.textContent).toContain('Low');
    expect(el.textContent).toContain('reporter1');
    expect(el.textContent).toContain('reporter2');
  });

  it('shows "no pending reports" when the queue is empty', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/reports').flush({ reports: [] });
    fixture.detectChanges();

    expect(el.textContent).toContain('Queue is clear');
  });

  it('opens the detail panel and resolves a report', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/reports').flush(reports);
    fixture.detectChanges();

    const viewButtons = Array.from(el.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'View',
    );
    (viewButtons[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.textContent).toContain('You are worthless and I will find you.');
    expect(el.textContent).toContain('badactor');

    const reason = el.querySelector('textarea') as HTMLTextAreaElement;
    reason.value = 'Verified harassment — banning.';
    reason.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'PermanentBan';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    (el.querySelector('.fc-primary') as HTMLButtonElement).click();

    const req = expectApi(http, '/admin/reports/r1/resolve');
    expect(req.request.body).toEqual({
      action: 'PermanentBan',
      reason: 'Verified harassment — banning.',
    });
    req.flush(null);
    fixture.detectChanges();

    // After resolve, queue reloads — row count should drop
    expectApi(http, '/admin/reports').flush({ reports: [] });
    fixture.detectChanges();

    expect(el.textContent).toContain('Queue is clear');
  });

  it('requires a reason before resolving', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/reports').flush(reports);
    fixture.detectChanges();

    const viewButtons = Array.from(el.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'View',
    );
    (viewButtons[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    // Select an action but no reason
    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'Warning';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const submit = el.querySelector('.fc-primary') as HTMLButtonElement;
    submit.click();
    fixture.detectChanges();

    // No request should have gone out
    http.expectNone((req) => req.url.endsWith('/resolve'));
  });

  it('shows suspension days input for TemporarySuspension', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/reports').flush(reports);
    fixture.detectChanges();

    const viewButtons = Array.from(el.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'View',
    );
    (viewButtons[0] as HTMLButtonElement).click();
    fixture.detectChanges();

    const select = el.querySelector('select') as HTMLSelectElement;
    select.value = 'TemporarySuspension';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // Suspension days input should appear
    expect(el.querySelector('input[type="number"]')).not.toBeNull();
  });
});
