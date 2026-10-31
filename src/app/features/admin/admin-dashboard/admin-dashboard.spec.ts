import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminDashboard } from './admin-dashboard';
import { configureAuthTestBed, expectApi } from '../../auth/test-utils';

const metrics = {
  reports: {
    total: 42,
    pending: 7,
    resolved: 30,
    dismissed: 5,
    avgResolutionHours: 12.5,
  },
  appeals: {
    total: 11,
    pending: 3,
    reviewed: 8,
    overturned: 2,
    overturnRate: 0.25,
    avgResolutionHours: 34.0,
  },
  totalModerationActions: 94,
};

describe('AdminDashboard', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([AdminDashboard]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(AdminDashboard);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('shows headline metrics', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/metrics').flush(metrics);
    fixture.detectChanges();

    expect(el.textContent).toContain('42'); // reports total
    expect(el.textContent).toContain('7'); // pending
    expect(el.textContent).toContain('30'); // resolved
    expect(el.textContent).toContain('5'); // dismissed
    expect(el.textContent).toContain('11'); // appeals total
    expect(el.textContent).toContain('3'); // pending appeals
    expect(el.textContent).toContain('94'); // total actions
    expect(el.textContent).toContain('25%'); // overturn rate
  });

  it('shows loading state first, then metrics', () => {
    const { fixture, el } = create();
    expect(el.textContent).toContain('Loading…');
    expectApi(http, '/admin/metrics').flush(metrics);
    fixture.detectChanges();
    expect(el.textContent).toContain('42');
  });

  it('shows an error banner and retry button on failure', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/metrics').flush(null, { status: 403, statusText: 'x' });
    fixture.detectChanges();

    expect(el.textContent).toContain("This account isn't available.");
    expect(el.querySelector('button')?.textContent).toContain('Try again');
  });

  it('links to each queue', () => {
    const { fixture, el } = create();
    expectApi(http, '/admin/metrics').flush(metrics);
    fixture.detectChanges();

    expect(el.querySelector('a[routerLink="/admin/reports"]')).not.toBeNull();
    expect(el.querySelector('a[routerLink="/admin/appeals"]')).not.toBeNull();
    expect(el.querySelector('a[routerLink="/admin/users"]')).not.toBeNull();
    expect(el.querySelector('a[routerLink="/admin/tags"]')).not.toBeNull();
  });
});
