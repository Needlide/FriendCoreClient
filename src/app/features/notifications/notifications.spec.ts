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

  it('links the row to the notification about, which differs per type', () => {
    // The whole row is one link now, because a notification is about its subject. entityId
    // means something different for each type, so this is the case where a wrong assumption
    // produces a link to a 404 rather than an obvious break.
    const cases = [
      { type: 'NewFollower', entityId: 'u1', href: '/u/bob' },
      { type: 'NewLike', entityId: 'p1', href: '/posts/p1' },
      // A comment notification carries the POST id, not the comment's — verified against
      // NotificationEventHandlers, and the easiest of these four to get wrong.
      { type: 'NewComment', entityId: 'p1', href: '/posts/p1' },
      // The gap this fixes: a message notification used to link only to the sender's profile,
      // so "Alice sent you a message" led nowhere near the conversation.
      { type: 'NewMessage', entityId: 'c1', href: '/messages/c1' },
      // An unknown future type still lands somewhere correct rather than nowhere.
      { type: 'SomethingNew', entityId: 'zzz', href: '/u/bob' },
    ];

    for (const { type, entityId, href } of cases) {
      const { fixture, el } = create();
      expectApi(http, '/notifications').flush({
        notifications: [
          {
            id: 'n1',
            type,
            actor: { userId: 'u1', username: 'bob', displayName: 'Bob', isVerified: false },
            entityId,
            isRead: false,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      fixture.detectChanges();

      const link = el.querySelector('a.row-link');
      expect(link?.getAttribute('href'), `${type} should link to ${href}`).toBe(href);
      // The row text is the accessible name; the link must not announce anything extra.
      expect(link?.textContent).toContain('Bob');
      fixture.destroy();
    }
  });

  it('offers no nested link inside a row link', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();

    // The actor is no longer an anchor, so there is nothing invalid to nest — and the subject
    // always offers a route to the actor anyway.
    expect(el.querySelector('.body p a')).toBeNull();
    expect(el.querySelector('.row-link .actor')?.textContent).toContain('Bob');
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

  it('marks one notification read and updates the badge from the response', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();
    expect(el.querySelector('.row.unread')).not.toBeNull();

    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Mark notification from Bob as read"]',
    )!.click();
    const req = expectApi(http, '/notifications/n1/read');
    expect(req.request.method).toBe('POST');
    req.flush({ count: 0 });
    fixture.detectChanges();

    expect(el.querySelector('.row.unread')).toBeNull();
    expect(el.textContent).not.toContain('Mark read');
    expect(TestBed.inject(NotificationsService).unread()).toBe(0);
  });

  it('deletes one notification and adopts the server count', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete notification from Bob"]',
    )!.click();
    const req = expectApi(http, '/notifications/n1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ count: 0 });
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Bob started following you');
    expect(el.textContent).toContain('Nothing new');
    expect(TestBed.inject(NotificationsService).unread()).toBe(0);
  });

  it('keeps the row when a row action fails', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete notification from Bob"]',
    )!.click();
    expectApi(http, '/notifications/n1').flush(
      [{ code: 'Server.Error', description: 'Could not delete that.', type: 'Unexpected' }],
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Could not delete that.');
    expect(el.textContent).toContain('Bob started following you');
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
