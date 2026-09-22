import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { NotificationsService } from './notifications.service';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

/**
 * The badge contract: one shared signal, mutated only by refreshUnread().
 * markAllRead zeroes it on success (the server marks ALL — exact, not optimistic)
 * and leaves it alone on failure.
 */
describe('NotificationsService unread', () => {
  let http: HttpTestingController;
  let service: NotificationsService;

  beforeEach(async () => {
    await configureAuthTestBed([]);
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(NotificationsService);
  });

  afterEach(() => http.verify());

  it('refreshUnread publishes the server count', () => {
    service.refreshUnread();
    expectApi(http, '/notifications/unread-count').flush({ count: 3 });
    expect(service.unread()).toBe(3);
  });

  it('markAllRead zeroes the badge without a refetch', () => {
    service.refreshUnread();
    expectApi(http, '/notifications/unread-count').flush({ count: 2 });
    expect(service.unread()).toBe(2);

    service.markAllRead().subscribe();
    expectApi(http, '/notifications/read').flush(null);
    expect(service.unread()).toBe(0);
    http.expectNone((r) => r.url.endsWith('/notifications/unread-count'));
  });

  it('markAllRead keeps the count when the server rejects it', () => {
    service.refreshUnread();
    expectApi(http, '/notifications/unread-count').flush({ count: 2 });

    service.markAllRead().subscribe({ error: () => undefined });
    expectApi(http, '/notifications/read').flush(null, { status: 500, statusText: 'x' });
    expect(service.unread()).toBe(2);
  });
});
