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

  it('connects realtime and shows the unread badge', () => {
    const { fixture, el } = create();
    expect(realtime.connect).toHaveBeenCalled();
    expectApi(http, '/notifications/unread-count').flush({ count: 3 });
    expectApi(http, '/users/me/snooze').flush({ snoozedUntil: null });
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

  it('disconnects realtime before logging out, then leaves for login', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications/unread-count').flush({ count: 0 });
    expectApi(http, '/users/me/snooze').flush({ snoozedUntil: null });
    expectApi(http, '/users/me/preferences').flush({
      hideFlashingMedia: true,
      reduceMotion: false,
      disableAutoplay: true,
      reduceVisualNoise: false,
      contentPreference: 'General',
    });
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
