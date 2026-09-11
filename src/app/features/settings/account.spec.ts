import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { EMPTY } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { Account } from './account';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const me = {
  accessToken: 'token',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: 'u9',
  username: 'alice',
  displayName: 'Alice',
  isEmailVerified: false,
};

describe('Account', () => {
  let http: HttpTestingController;
  const realtime = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    notification$: EMPTY,
    resync$: EMPTY,
    message$: EMPTY,
  };

  beforeEach(async () => {
    await configureAuthTestBed([Account]);
    TestBed.overrideProvider(RealtimeService, { useValue: realtime });
    realtime.disconnect.mockClear();
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService)
      .login({ email: 'alice@example.com', password: 'password123' })
      .subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Account);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('explains the posting block and resends verification', () => {
    const { fixture, el } = create();
    expect(el.textContent).toContain('posting is disabled');
    const resend = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Resend'),
    ) as HTMLButtonElement;
    resend.click();
    expectApi(http, '/auth/resend-verification').flush(null);
    fixture.detectChanges();
    expect(el.textContent).toContain('check your inbox');
  });

  it('logs out through realtime-first teardown', () => {
    const { el } = create();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const logout = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Log out'),
    ) as HTMLButtonElement;
    logout.click();

    return Promise.resolve().then(() => {
      expect(realtime.disconnect).toHaveBeenCalled();
      expectApi(http, '/auth/logout').flush(null);
      expect(navigate).toHaveBeenCalledWith(['/auth/login']);
    });
  });
});
