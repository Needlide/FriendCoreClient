import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { Notifications } from './notifications';
import { NotificationsService } from './notifications.service';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const list = {
  notifications: [
    {
      id: 'n1',
      type: 'NewFollower',
      actor: { userId: 'u1', username: 'bob', displayName: 'Bob', isVerified: false },
      entityId: 'u1',
      isRead: false,
      createdAt: new Date().toISOString(),
    },
  ],
};

describe('Notifications', () => {
  let http: HttpTestingController;
  const pushes = new Subject<{ type: string }>();

  beforeEach(async () => {
    await configureAuthTestBed([Notifications]);
    // Drive pushes manually: the page must refetch the hydrated list per event.
    TestBed.overrideProvider(RealtimeService, {
      useValue: { notification$: pushes.asObservable(), resync$: new Subject().asObservable() },
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create(mutedTypes: string[] = []) {
    const fixture = TestBed.createComponent(Notifications);
    fixture.detectChanges();
    // Muted-types load fires alongside the list on init.
    expectApi(http, '/users/me/notification-types').flush({ mutedTypes });
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders hydrated text from REST, not the skinny push', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();
    expect(el.textContent).toContain('Bob started following you');
  });

  it('links the actor name to their profile', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();
    const link = el.querySelector('.body p a');
    expect(link?.textContent).toContain('Bob');
    expect(link?.getAttribute('href')).toBe('/u/bob');
  });

  it('mutes a type with a whole-set PATCH and adopts the echo', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();

    const followers = Array.from(el.querySelectorAll('.types input')).find((i) =>
      (i.nextSibling?.textContent ?? '').includes('New followers'),
    ) as HTMLInputElement;
    followers.click();
    const req = expectApi(http, '/users/me/notification-types');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ mutedTypes: ['NewFollower'] });
    req.flush({ mutedTypes: ['NewFollower'] });
    fixture.detectChanges();
    expect((el.querySelectorAll('.types input')[0] as HTMLInputElement).checked).toBe(false);
  });

  it('refetches the list on every push', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();

    pushes.next({ type: 'NewLike' });
    expectApi(http, '/notifications').flush({ notifications: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing new');
  });

  it('marks all read in one call and clears the flags locally', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();
    expect(el.querySelector('.row.unread')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('.head button')!.click();
    expectApi(http, '/notifications/read').flush(null);
    fixture.detectChanges();
    expect(el.querySelector('.row.unread')).toBeNull();
  });

  it('mark-all-read clears the shared badge immediately (no reload needed)', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('.head button')!.click();
    expectApi(http, '/notifications/read').flush(null);
    expect(TestBed.inject(NotificationsService).unread()).toBe(0);
  });

  it('shows the calm empty state with no notifications', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush({ notifications: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing new');
  });

  it('snoozes for a duration and renders the active state with lift', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush({ notifications: [] });
    fixture.detectChanges();

    const twoHours = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().startsWith('2 hours'),
    ) as HTMLButtonElement;
    twoHours.click();
    const req = expectApi(http, '/users/me/snooze');
    expect(req.request.method).toBe('POST');
    const until = req.request.body['until'] as string;
    // A ~2h ISO instant, not a magic string — the server validates the window.
    const hoursOut = (Date.parse(until) - Date.now()) / 3_600_000;
    expect(hoursOut).toBeGreaterThan(1.9);
    expect(hoursOut).toBeLessThan(2.1);
    req.flush({ snoozedUntil: until });
    fixture.detectChanges();

    expect(el.textContent).toContain('Silenced until');
    expect(TestBed.inject(NotificationsService).snoozedUntil()).toBe(until);

    const lift = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Lift snooze',
    ) as HTMLButtonElement;
    lift.click();
    const del = expectApi(http, '/users/me/snooze');
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
    fixture.detectChanges();
    expect(el.textContent).toContain('2 hours');
    expect(TestBed.inject(NotificationsService).snoozedUntil()).toBeNull();
  });
});
