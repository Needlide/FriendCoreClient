import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { Thread } from './thread';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const me = {
  accessToken: 'token',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: 'me',
  username: 'alice',
  displayName: 'Alice',
  isEmailVerified: true,
};

function message(id: string, senderId: string, content: string) {
  return {
    id,
    conversationId: 'c1',
    senderId,
    content,
    status: 'Sent',
    createdAt: new Date().toISOString(),
  };
}

const page1 = {
  messages: [message('m3', 'bob', 'third'), message('m2', 'me', 'second')],
  nextCursor: 'cursor1',
};

describe('Thread', () => {
  let http: HttpTestingController;
  const pushes = new Subject<{
    conversationId: string;
    id: string;
    senderId: string;
    content: string;
    status: string;
    createdAt: string;
  }>();

  beforeEach(async () => {
    await configureAuthTestBed([Thread]);
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        paramMap: of(convertToParamMap({ id: 'c1' })),
        snapshot: { paramMap: convertToParamMap({ id: 'c1' }) },
      },
    });
    TestBed.overrideProvider(RealtimeService, {
      useValue: { message$: pushes.asObservable(), resync$: new Subject().asObservable() },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService)
      .login({ username: 'alice', password: 'password123' })
      .subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Thread);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** Latest page load always ends with a mark-read beacon (flushed here). */
  function loadLatest() {
    expectApi(http, '/conversations/c1/messages').flush(page1);
    expectApi(http, '/conversations/c1/read').flush(null);
  }

  it('displays oldest-first and marks the thread read on open', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();
    const bubbles = Array.from(el.querySelectorAll('.bubble p')).map((b) => b.textContent);
    expect(bubbles).toEqual(['second', 'third']);
  });

  it('prepends older pages above without disturbing the new ones', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('.older')!.click();
    const older = expectApi(http, '/conversations/c1/messages');
    expect(older.request.params.get('cursor')).toBe('cursor1');
    older.flush({ messages: [message('m1', 'bob', 'first')], nextCursor: null });
    fixture.detectChanges();

    const bubbles = Array.from(el.querySelectorAll('.bubble p')).map((b) => b.textContent);
    expect(bubbles).toEqual(['first', 'second', 'third']);
  });

  it('sends from the POST response, keeps the text on failure', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    const box = el.querySelector('textarea')!;
    box.value = 'hey there';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.composer button')!.click();

    const req = expectApi(http, '/conversations/c1/messages');
    expect(req.request.body).toEqual({ content: 'hey there' });
    req.flush(message('m4', 'me', 'hey there'));
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();

    expect(el.textContent).toContain('hey there');
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('merges a live push for this conversation, ignores others', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    pushes.next({ ...message('m9', 'bob', 'live!'), conversationId: 'other' });
    fixture.detectChanges();
    expect(el.textContent).not.toContain('live!');

    pushes.next({ ...message('m9', 'bob', 'live!'), conversationId: 'c1' });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();
    expect(el.textContent).toContain('live!');
  });

  it('shows the not-found state for a gone conversation', () => {
    const { fixture, el } = create();
    expectApi(http, '/conversations/c1/messages').flush(
      [{ code: 'Messaging.ConversationNotFound', description: 'Gone.' }],
      { status: 404, statusText: 'Not Found' },
    );
    fixture.detectChanges();
    expect(el.textContent).toContain('Conversation not found');
  });
});
