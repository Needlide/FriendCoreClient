import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { PostMedia } from '../../core/models/posts.models';
import { MessageResponse } from '../../core/models/realtime.models';
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

function message(
  id: string,
  senderId: string,
  content: string | null,
  media: PostMedia | null = null,
): MessageResponse {
  return {
    id,
    conversationId: 'c1',
    senderId,
    content,
    status: 'Sent',
    createdAt: new Date().toISOString(),
    media,
  };
}

const page1 = {
  messages: [message('m3', 'bob', 'third'), message('m2', 'me', 'second')],
  nextCursor: 'cursor1',
};

describe('Thread', () => {
  let http: HttpTestingController;
  const pushes = new Subject<MessageResponse>();

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
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
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
    expect(req.request.body).toEqual({ content: 'hey there', mediaId: null });
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

  // ── Attachments ─────────────────────────────────────────────────────────────
  // The upload is the post pipeline unchanged, and the bubble must render the image
  // with no invented text where Content is null.

  const media = {
    id: 'med1',
    hasFlashingWarning: false,
    hasIntenseMotionWarning: false,
    variants: [
      { type: 'Small', url: 'http://storage.test/small.webp', widthPx: 300, heightPx: 200 },
    ],
  };

  /** Picks a PNG and drives upload → Processing → Ready, the shared media path. */
  function attachImage(el: HTMLElement): void {
    const file = new File([new Uint8Array([1, 2, 3])], 'pic.png', { type: 'image/png' });
    const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
  }

  it('renders an attachment-only message with no placeholder text', () => {
    const { fixture, el } = create();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [message('m1', 'me', null, media)],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();

    expect(el.querySelector('fc-media-viewer')).not.toBeNull();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('http://storage.test/small.webp');
    // No empty <p> and no "Sent a file" filler.
    expect(el.querySelector('.bubble p')).toBeNull();
  });

  it('uploads, then sends the image with no text at all', () => {
    vi.useFakeTimers();
    try {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();

      attachImage(el);
      fixture.detectChanges();
      expectApi(http, '/media').flush({ id: 'med9', status: 'Processing' });
      vi.advanceTimersByTime(0);
      expectApi(http, '/media/med9/status').flush({ id: 'med9', status: 'Ready' });
      fixture.detectChanges();

      // No text typed — the image alone is a valid message.
      el.querySelector<HTMLButtonElement>('.composer button[type=submit]')!.click();
      const req = expectApi(http, '/conversations/c1/messages');
      expect(req.request.body).toEqual({ content: null, mediaId: 'med9' });
      req.flush(message('m5', 'me', null, media));
      expectApi(http, '/conversations/c1/read').flush(null);
      fixture.detectChanges();

      expect(el.querySelector('fc-media-viewer')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a non-image before any upload is attempted', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    const file = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
    const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    http.expectNone((r) => r.url.endsWith('/api/v1/media'));
    expect(el.textContent).toContain('Only JPEG, PNG, WebP, or GIF');
  });

  it('keeps the image in the draft when sending fails', () => {
    vi.useFakeTimers();
    try {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();

      attachImage(el);
      fixture.detectChanges();
      expectApi(http, '/media').flush({ id: 'med9', status: 'Processing' });
      vi.advanceTimersByTime(0);
      expectApi(http, '/media/med9/status').flush({ id: 'med9', status: 'Ready' });
      fixture.detectChanges();

      el.querySelector<HTMLButtonElement>('.composer button[type=submit]')!.click();
      expectApi(http, '/conversations/c1/messages').flush(
        [{ code: 'Common.ServerError', description: 'Boom.' }],
        { status: 500, statusText: 'Server Error' },
      );
      fixture.detectChanges();

      // Nothing was sent, so the chosen image must still be attached for a retry.
      expect(el.querySelector('.attachment .preview')).not.toBeNull();
      expect(el.textContent).toContain("Couldn't send");
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * Regression for the switching-conversations race. Kept in its own describe because
 * it needs a mutable paramMap (the instance-reuse case) rather than the fixed `of()`
 * the suite above uses.
 */
describe('Thread conversation switching', () => {
  let http: HttpTestingController;
  const pushes = new Subject<unknown>();
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    await configureAuthTestBed([Thread]);
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'c1' }));
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: paramMap$, snapshot: { paramMap: paramMap$.value } },
    });
    TestBed.overrideProvider(RealtimeService, {
      useValue: { message$: pushes.asObservable(), resync$: new Subject().asObservable() },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => http.verify());

  /**
   * Switching conversations reuses the component instance, and the old paramMap
   * subscription was never torn down (paramMap is a never-completed BehaviorSubject).
   * A slow response for the first conversation could therefore paint itself — and
   * fire its mark-read beacon — inside the second one.
   */
  it('cancels the previous conversation load when :id changes', () => {
    const fixture = TestBed.createComponent(Thread);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const staleC1 = http.expectOne((r) => r.url.endsWith('/conversations/c1/messages'));

    // Navigate to another conversation before c1 resolves.
    paramMap$.next(convertToParamMap({ id: 'c2' }));
    fixture.detectChanges();

    // switchMap unsubscribed c1's request the moment c2's :id arrived.
    expect(staleC1.cancelled).toBe(true);

    expectApi(http, '/conversations/c2/messages').flush({
      messages: [
        { ...message('x2', 'bob', 'in c2'), conversationId: 'c2' },
        { ...message('x1', 'me', 'also c2'), conversationId: 'c2' },
      ],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c2/read').flush(null);
    fixture.detectChanges();

    expect(el.textContent).toContain('in c2');
    expect(el.textContent).toContain('also c2');
    // The abandoned conversation must not have marked itself read on the way out.
    http.expectNone((r) => r.url.endsWith('/conversations/c1/read'));
  });
});
