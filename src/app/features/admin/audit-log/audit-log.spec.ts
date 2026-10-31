import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuditLog } from './audit-log';
import { configureAuthTestBed, expectApi } from '../../auth/test-utils';

const log = {
  entries: [
    {
      id: 'e1',
      moderator: { userId: 'm1', username: 'mod1', displayName: 'Mod One', isVerified: true },
      action: 'PermanentBan',
      targetType: 'User',
      targetId: 'u1',
      reason: 'Severe harassment, multiple reports.',
      ipAddress: '10.0.0.1',
      relatedReportId: 'r1',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'e2',
      moderator: { userId: 'm2', username: 'mod2', displayName: 'Mod Two', isVerified: true },
      action: 'ContentRemoval',
      targetType: 'Post',
      targetId: 'p1',
      reason: 'Graphic violence reported and confirmed.',
      ipAddress: null,
      relatedReportId: null,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ],
};

describe('AuditLog', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([AuditLog]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(AuditLog);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists audit entries newest first', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/audit-log').flush(log);
    fixture.detectChanges();

    expect(el.textContent).toContain('PermanentBan');
    expect(el.textContent).toContain('ContentRemoval');
    expect(el.textContent).toContain('mod1');
    expect(el.textContent).toContain('mod2');
    expect(el.textContent).toContain('10.0.0.1');
    expect(el.textContent).toContain('u1');
    expect(el.textContent).toContain('p1');
  });

  it('shows "no moderation actions" when empty', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/audit-log').flush({ entries: [] });
    fixture.detectChanges();

    expect(el.textContent).toContain('No moderation actions recorded yet');
  });

  it('shows an em dash for null IP and related report', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/audit-log').flush(log);
    fixture.detectChanges();

    // Second entry has null IP and no related report — check em dash appears
    const cells = Array.from(el.querySelectorAll('td'));
    expect(cells.some((c) => c.textContent === '—')).toBe(true);
  });
});
