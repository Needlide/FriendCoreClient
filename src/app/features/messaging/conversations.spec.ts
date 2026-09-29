import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { Conversations } from './conversations';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const listResponse = {
  conversations: [
    {
      id: 'c1',
      otherParticipant: { userId: 'u1', username: 'bob', displayName: 'Bob', isVerified: false },
      lastMessageAt: new Date().toISOString(),
      unreadCount: 2,
    },
  ],
};

describe('Conversations', () => {
  let http: HttpTestingController;
  const pushes = new Subject<unknown>();

  beforeEach(async () => {
    await configureAuthTestBed([Conversations]);
    TestBed.overrideProvider(RealtimeService, {
      useValue: { message$: pushes.asObservable(), resync$: new Subject().asObservable() },
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Conversations);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders rows with unread counts', () => {
    const { fixture, el } = create();
    expectApi(http, '/conversations').flush(listResponse);
    fixture.detectChanges();
    expect(el.textContent).toContain('Bob');
    expect(el.querySelector('.unread')?.textContent).toContain('2');
  });

  it('refetches on messaging pushes', () => {
    const { fixture, el } = create();
    expectApi(http, '/conversations').flush(listResponse);
    fixture.detectChanges();

    pushes.next({ conversationId: 'c1' });
    expectApi(http, '/conversations').flush({ conversations: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('No messages yet');
  });

  it('opens the support thread from the empty state', () => {
    const { fixture, el } = create();
    expectApi(http, '/conversations').flush({ conversations: [] });
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    el.querySelector<HTMLButtonElement>('.support-actions button')!.click();
    const req = expectApi(http, '/conversations/support');
    expect(req.request.method).toBe('POST');
    req.flush({ ...listResponse.conversations[0], id: 'support1' });
    expect(navigate).toHaveBeenCalledWith(['/messages', 'support1']);
  });

  /**
   * Regression: `error` used to be set by a failed background refetch and never
   * cleared on success. Since the template checks `@else if (error())` before the
   * list, one transient failure stranded the user on "Try again" even after later
   * refreshes repopulated the list behind it.
   */
  it('recovers the list after a failed background refetch', () => {
    const { fixture, el } = create();
    expectApi(http, '/conversations').flush(listResponse);
    fixture.detectChanges();
    expect(el.textContent).toContain('Bob');

    // A push-triggered refresh fails.
    pushes.next({ conversationId: 'c1' });
    expectApi(http, '/conversations').flush(
      [{ code: 'Common.ServerError', description: 'Boom.' }],
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();
    expect(el.textContent).toContain('Try again');

    // The next refresh succeeds — the error screen must not survive it.
    pushes.next({ conversationId: 'c1' });
    expectApi(http, '/conversations').flush(listResponse);
    fixture.detectChanges();
    expect(el.textContent).toContain('Bob');
    expect(el.textContent).not.toContain('Try again');
  });

  /** A burst of pushes must not leave overlapping GETs able to land out of order. */
  it('cancels an in-flight refetch when a newer push arrives', () => {
    const { fixture } = create();
    expectApi(http, '/conversations').flush(listResponse);
    fixture.detectChanges();

    pushes.next({ conversationId: 'c1' });
    const stale = http.expectOne((r) => r.url.endsWith('/conversations'));

    pushes.next({ conversationId: 'c1' });
    fixture.detectChanges();
    expect(stale.cancelled).toBe(true);

    expectApi(http, '/conversations').flush(listResponse);
  });
});
