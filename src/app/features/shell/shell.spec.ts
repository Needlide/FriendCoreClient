import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { Shell } from './shell';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const me = {
  accessToken: 'token',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: 'u9',
  username: 'alice',
  displayName: 'Alice',
  isEmailVerified: true,
};

describe('Shell', () => {
  let http: HttpTestingController;
  const realtime = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    notification$: EMPTY,
    resync$: EMPTY,
    message$: EMPTY,
  };

  beforeEach(async () => {
    await configureAuthTestBed([Shell]);
    // Never open real sockets in specs — the lifecycle (connect on init, disconnect
    // on logout) is what's under test, not SignalR itself.
    TestBed.overrideProvider(RealtimeService, { useValue: realtime });
    realtime.connect.mockClear();
    realtime.disconnect.mockClear();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /**
   * The shell's four init reads. The conversations one is the messages badge's own load — it is a
   * sum over conversations, so unlike notifications there is no single endpoint to bump.
   */
  function flushInitReads(unread = 0): void {
    expectApi(http, '/notifications/unread-count').flush({ count: 0 });
    expectApi(http, '/users/me/snooze').flush({ snoozedUntil: null });
    expectApi(http, '/conversations').flush({
      conversations: unread
        ? [
            {
              id: 'c1',
              otherParticipant: { id: 'u1', username: 'bob', displayName: 'Bob' },
              lastMessageAt: new Date().toISOString(),
              unreadCount: unread,
            },
          ]
        : [],
    });
    expectApi(http, '/users/me/preferences').flush({
      hideFlashingMedia: true,
      reduceMotion: false,
      disableAutoplay: true,
      reduceVisualNoise: false,
      contentPreference: 'General',
    });
  }

  it('connects realtime and shows the notification badge', () => {
    const { fixture, el } = create();
    expect(realtime.connect).toHaveBeenCalled();
    expectApi(http, '/notifications/unread-count').flush({ count: 3 });
    expectApi(http, '/users/me/snooze').flush({ snoozedUntil: null });
    expectApi(http, '/conversations').flush({ conversations: [] });
    // Shell also loads accessibility prefs (safe defaults apply until they land).
    expectApi(http, '/users/me/preferences').flush({
      hideFlashingMedia: true,
      reduceMotion: false,
      disableAutoplay: true,
      reduceVisualNoise: false,
      contentPreference: 'General',
    });
    fixture.detectChanges();
    const bell = el.querySelector('fc-notification-bell a')!;
    expect(bell.getAttribute('aria-label')).toContain('3 unread');
  });

  it('shows a messages badge counting unread across conversations', async () => {
    const { fixture, el } = create();
    flushInitReads(4);
    // The badge load resolves through firstValueFrom, so the store updates a microtask after the
    // response — detecting changes synchronously here would assert against a badge that does not
    // exist yet.
    await fixture.whenStable();
    fixture.detectChanges();

    const badge = el.querySelector('.nav-badge');
    expect(badge, 'no badge rendered').not.toBeNull();
    // The bare number means nothing read aloud, so the accessible text spells it out…
    expect(badge!.querySelector('.fc-sr-only')?.textContent).toContain('4 unread messages');
    // …and the visual number must not be announced a second time.
    expect(badge!.querySelector('[aria-hidden="true"]')?.textContent).toBe('4');
  });

  it('credits the DNS provider in the footer', () => {
    // FreeDNS provides the subdomain and asks for a text link in return. A single test so the
    // attribution cannot be dropped by accident as unrelated chrome gets edited.
    const { fixture, el } = create();
    flushInitReads();
    fixture.detectChanges();

    const footer = el.querySelector('footer.site-footer');
    expect(footer, 'no site footer rendered').not.toBeNull();

    const link = footer!.querySelector<HTMLAnchorElement>('a');
    expect(link?.textContent?.trim()).toBe('Free DNS');
    expect(link?.getAttribute('href')).toBe('https://freedns.afraid.org/');
    // Outbound link: without noopener the opened page gets a handle on this one.
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('shows no messages badge when everything is read', async () => {
    const { fixture, el } = create();
    flushInitReads(0);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('.nav-badge')).toBeNull();
  });

  it('disconnects realtime before logging out, then leaves for login', () => {
    const { fixture, el } = create();
    flushInitReads();
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLDetailsElement>('.avatar-menu')!.open = true;
    fixture.detectChanges();
    const logout = Array.from(el.querySelectorAll('.avatar-menu .items button')).find(
      (b) => b.textContent?.trim() === 'Log out',
    ) as HTMLButtonElement;
    logout.click();

    // disconnect() resolves first (mocked), then the logout POST fires…
    return Promise.resolve().then(() => {
      expect(realtime.disconnect).toHaveBeenCalled();
      expectApi(http, '/auth/logout').flush(null);
      expect(navigate).toHaveBeenCalledWith(['/auth/login']);
    });
  });
});
