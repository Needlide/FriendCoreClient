import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture } from '@angular/core/testing';
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
    editedAt: null,
  };
}

const page1 = {
  messages: [message('m3', 'bob', 'third'), message('m2', 'me', 'second')],
  nextCursor: 'cursor1',
};

describe('Thread', () => {
  let http: HttpTestingController;
  const pushes = new Subject<MessageResponse>();
  const edits = new Subject<MessageResponse>();
  const deletions = new Subject<{ messageId: string }>();

  beforeEach(async () => {
    // The thread now hosts a ReportDialog, and jsdom implements <dialog> markup but not
    // showModal()/close() — stub the two methods the component calls.
    window.HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    window.HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    await configureAuthTestBed([Thread]);
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        paramMap: of(convertToParamMap({ id: 'c1' })),
        snapshot: { paramMap: convertToParamMap({ id: 'c1' }) },
      },
    });
    TestBed.overrideProvider(RealtimeService, {
      useValue: {
        message$: pushes.asObservable(),
        messageEdited$: edits.asObservable(),
        messageDeleted$: deletions.asObservable(),
        resync$: new Subject().asObservable(),
      },
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

  /** Opens the inline editor on the nth bubble and checks it was seeded with that message. */
  function openEditor(fixture: ComponentFixture<Thread>, index: number, text: string): void {
    const el = fixture.nativeElement as HTMLElement;
    el.querySelectorAll('.bubble')
      [index].querySelector<HTMLButtonElement>('.actions [role=menuitem]')!
      .click();
    fixture.detectChanges();
    const box = el.querySelector<HTMLTextAreaElement>('.editor textarea')!;
    expect(box.value).toBe(text);
  }

  /** Latest page load always ends with a mark-read beacon (flushed here). */
  function loadLatest() {
    expectApi(http, '/conversations/c1/messages').flush(page1);
    expectApi(http, '/conversations/c1/read').flush(null);
  }

  /**
   * Bubble text minus the bubble's chrome — timestamp, "edited" marker and the action menu.
   * Those are metadata and affordances; only the message itself is what these tests assert on.
   */
  function bubbleTexts(el: HTMLElement): (string | undefined)[] {
    return Array.from(el.querySelectorAll('.bubble')).map((bubble) => {
      const clone = bubble.cloneNode(true) as HTMLElement;
      clone.querySelector('.meta')?.remove();
      clone.querySelector('.actions')?.remove();
      return clone.textContent?.trim();
    });
  }

  it('displays oldest-first and marks the thread read on open', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();
    expect(bubbleTexts(el)).toEqual(['second', 'third']);
  });

  it('stamps every bubble with its sent time', () => {
    const { fixture, el } = create();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [
        {
          ...message('m3', 'bob', 'third'),
          createdAt: new Date(Date.now() - 7200_000).toISOString(),
        },
      ],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();

    const times = Array.from(el.querySelectorAll('.sent-at')).map((t) => t.textContent?.trim());
    expect(times).toEqual(['2 hours ago']);
    // The exact instant stays machine-readable for assistive tech and tooltips.
    expect(el.querySelector('.sent-at')?.getAttribute('datetime')).toBeTruthy();
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

    expect(bubbleTexts(el)).toEqual(['first', 'second', 'third']);
  });

  it('sends from the POST response, keeps the text on failure', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    const box = el.querySelector<HTMLTextAreaElement>('.composer textarea')!;
    box.value = 'hey there';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    // Scoped to the submit button: the safety declaration embeds a Tooltip, whose "?" is
    // also a <button> inside .composer, so an unscoped selector would click that instead.
    el.querySelector<HTMLButtonElement>('.composer button[type=submit]')!.click();

    const req = expectApi(http, '/conversations/c1/messages');
    expect(req.request.body).toEqual({ content: 'hey there', mediaId: null });
    req.flush(message('m4', 'me', 'hey there'));
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();

    expect(el.textContent).toContain('hey there');
    expect((el.querySelector('.composer textarea') as HTMLTextAreaElement).value).toBe('');
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
    // No empty body element and no "Sent a file" filler — the bubble is media plus chrome only.
    expect(el.querySelector('.bubble fc-linkified-text')).toBeNull();
    expect(el.querySelector('.bubble')?.textContent).not.toContain('Sent a');
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
  // --- per-message actions ------------------------------------------------------------

  it('offers edit and delete on your own messages, report only on theirs', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    const bubbles = el.querySelectorAll('.bubble');
    const mine = bubbles[0]; // 'second' — oldest first
    const theirs = bubbles[1]; // 'third'

    const labels = (bubble: Element) =>
      Array.from(bubble.querySelectorAll('.actions [role=menuitem]')).map((b) =>
        b.textContent?.trim(),
      );

    expect(labels(mine)).toEqual(['Edit', 'Delete']);
    // The server refuses a self-report, so it is never offered on your own bubble.
    expect(labels(theirs)).toEqual(['Report']);
  });

  it('offers no edit on an attachment-only message', () => {
    const { fixture, el } = create();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [message('m1', 'me', null, media)],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();

    // There is no text to rewrite, and the server refuses the whole edit for one.
    const items = Array.from(el.querySelectorAll('.bubble .actions [role=menuitem]')).map((b) =>
      b.textContent?.trim(),
    );
    expect(items).toEqual(['Delete']);
  });

  it('edits in place, showing the server response and closing the editor', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    openEditor(fixture, 0, 'second');
    const box = el.querySelector<HTMLTextAreaElement>('.editor textarea')!;
    box.value = 'second, corrected';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('.editor-actions .fc-primary')!.click();
    const req = http.expectOne((r) => r.url.endsWith('/conversations/c1/messages/m2'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ content: 'second, corrected' });
    req.flush({ ...message('m2', 'me', 'second, corrected'), editedAt: new Date().toISOString() });
    fixture.detectChanges();

    expect(el.querySelector('.editor')).toBeNull();
    expect(bubbleTexts(el)).toEqual(['second, corrected', 'third']);
    // An edited message says so.
    expect(el.querySelector('.bubble .edited')?.textContent).toContain('edited');
  });

  it('rolls the bubble back and keeps the editor open when an edit fails', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    openEditor(fixture, 0, 'second');
    const box = el.querySelector<HTMLTextAreaElement>('.editor textarea')!;
    box.value = 'will fail';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.editor-actions .fc-primary')!.click();

    http
      .expectOne((r) => r.url.endsWith('/conversations/c1/messages/m2'))
      .flush([{ code: 'Messaging.MessageTooLong', description: 'Too long.' }], {
        status: 400,
        statusText: 'Bad Request',
      });
    fixture.detectChanges();

    // The editor stays open with the typing intact, so the change can simply be retried.
    expect(el.querySelector<HTMLTextAreaElement>('.editor textarea')!.value).toBe('will fail');
    expect(el.querySelector('.editor-error')?.textContent).toContain("Couldn't save");

    // And the bubble underneath was rolled back to the server's wording — closing the editor
    // reveals it. Without the rollback this would read 'will fail' as if it had been saved.
    el.querySelector<HTMLButtonElement>('.editor-actions .fc-secondary')!.click();
    fixture.detectChanges();
    expect(bubbleTexts(el)).toEqual(['second', 'third']);
  });

  it('requires confirmation before deleting, then drops the bubble', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    // Nothing is sent on opening the confirm panel — a misclick must not destroy a message.
    el.querySelectorAll<HTMLButtonElement>('.bubble .actions [role=menuitem]')[1].click();
    fixture.detectChanges();
    http.expectNone((r) => r.method === 'DELETE');
    expect(el.querySelector('.confirm')?.textContent).toContain('Delete this message?');

    el.querySelector<HTMLButtonElement>('.confirm-actions .fc-danger')!.click();
    const req = http.expectOne((r) => r.url.endsWith('/conversations/c1/messages/m2'));
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    fixture.detectChanges();

    expect(el.querySelector('.confirm')).toBeNull();
    expect(bubbleTexts(el)).toEqual(['third']);
  });

  it('cancels a delete without sending anything', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    el.querySelectorAll<HTMLButtonElement>('.bubble .actions [role=menuitem]')[1].click();
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.confirm-actions .fc-secondary')!.click();
    fixture.detectChanges();

    http.expectNone((r) => r.method === 'DELETE');
    expect(el.querySelector('.confirm')).toBeNull();
    expect(bubbleTexts(el)).toEqual(['second', 'third']);
  });

  it('reports the bubble you chose, scoped to this conversation', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    // The dialog is rendered in the thread, so its optional note textarea exists; the
    // per-bubble action menu is the only other textarea-less affordance.
    el.querySelectorAll('.bubble')[1]
      .querySelector<HTMLButtonElement>('.actions [role=menuitem]')!
      .click();
    fixture.detectChanges();

    const dialog = el.querySelector<HTMLDialogElement>('fc-report-dialog dialog')!;
    expect(dialog.open).toBe(true);
    expect(el.querySelector('fc-report-dialog')).not.toBeNull();

    // The target carries the conversation, which is what keeps the POST scoped.
    const post = () =>
      http.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/conversations/c1/messages/m3/report'),
      );

    const category = dialog.querySelector<HTMLInputElement>('input[type=radio]')!;
    category.click();
    fixture.detectChanges();
    dialog.querySelector<HTMLButtonElement>('.actions .fc-primary')!.click();

    post().flush(null);
  });

  it('applies a pushed edit to the message it names, without a refetch', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    edits.next({
      ...message('m3', 'bob', 'edited by the other side'),
      editedAt: '2026-10-02T10:00:00Z',
    });
    fixture.detectChanges();

    expect(bubbleTexts(el)).toEqual(['second', 'edited by the other side']);
    // The push carries the whole message, so the cheapest correct response is to apply it.
    http.expectNone((r) => r.url.endsWith('/conversations/c1/messages') && r.method === 'GET');
  });

  it('ignores an edit pushed for another conversation', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    edits.next({
      ...message('m3', 'bob', 'from another thread'),
      conversationId: 'c9',
      editedAt: '2026-10-02T10:00:00Z',
    });
    fixture.detectChanges();

    expect(bubbleTexts(el)).toEqual(['second', 'third']);
  });

  it('drops a bubble when a delete is pushed from the other side', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    deletions.next({ messageId: 'm2' });
    fixture.detectChanges();

    expect(bubbleTexts(el)).toEqual(['third']);
  });

  it('closes an open editor when the message it was editing is deleted', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    openEditor(fixture, 0, 'second');
    deletions.next({ messageId: 'm2' });
    fixture.detectChanges();

    // Editing a message that no longer exists would 404 on save.
    expect(el.querySelector('.editor')).toBeNull();
    expect(bubbleTexts(el)).toEqual(['third']);
  });

  it('declares media safety when sending an image in a DM', () => {
    vi.useFakeTimers();
    try {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();

      // The declaration exists only before a file is chosen, because the flags go out with
      // the upload request. A declaration made after the upload started would be dropped.
      const box = el.querySelector<HTMLInputElement>('fc-safety-declaration input')!;
      box.checked = true;
      box.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      attachImage(el);
      fixture.detectChanges();
      const upload = expectApi(http, '/media');
      // Both fields: the sender can say "one of these might apply", not which.
      const form = upload.request.body as FormData;
      expect(form.get('HasFlashingWarning')).toBe('true');
      expect(form.get('HasIntenseMotionWarning')).toBe('true');

      // Drain the upload so afterEach's http.verify() finds nothing open.
      upload.flush({ id: 'dm-media-1', status: 'Processing' });
      vi.advanceTimersByTime(0);
      expectApi(http, '/media/dm-media-1/status').flush({ id: 'dm-media-1', status: 'Ready' });
      fixture.detectChanges();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the declaration once an image is attached, so it cannot be ticked too late', () => {
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();
    expect(el.querySelector('fc-safety-declaration')).not.toBeNull();

    attachImage(el);
    fixture.detectChanges();

    // Offering a control whose value has already been sent would be a lie about what it does.
    expect(el.querySelector('fc-safety-declaration')).toBeNull();

    // Fail the upload: no polling chain is left dangling.
    expectApi(http, '/media').flush('boom', { status: 500, statusText: 'Server Error' });
  });

  it('sends both hazard fields as false when nothing is declared', () => {
    vi.useFakeTimers();
    try {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();

      attachImage(el);
      fixture.detectChanges();
      const upload = expectApi(http, '/media');
      const form = upload.request.body as FormData;
      expect(form.get('HasFlashingWarning')).toBe('false');
      expect(form.get('HasIntenseMotionWarning')).toBe('false');

      upload.flush({ id: 'dm-media-2', status: 'Processing' });
      vi.advanceTimersByTime(0);
      expectApi(http, '/media/dm-media-2/status').flush({ id: 'dm-media-2', status: 'Ready' });
      fixture.detectChanges();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the declaration after a successful send', () => {
    vi.useFakeTimers();
    const { fixture, el } = create();
    loadLatest();
    fixture.detectChanges();

    const box = el.querySelector<HTMLInputElement>('fc-safety-declaration input')!;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    attachImage(el);
    fixture.detectChanges();
    expectApi(http, '/media').flush({ id: 'dm-media-1', status: 'Processing' });
    vi.advanceTimersByTime(0);
    expectApi(http, '/media/dm-media-1/status').flush({ id: 'dm-media-1', status: 'Ready' });
    fixture.detectChanges();

    const text = el.querySelector<HTMLTextAreaElement>('.composer textarea')!;
    text.value = 'look at this';
    text.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.composer button[type=submit]')!.click();
    expectApi(http, '/conversations/c1/messages').flush({
      ...message('m9', 'me', 'look at this'),
      media: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();

    // It belongs to the pending upload, not to the conversation — otherwise the next image
    // would inherit a declaration the user never made about it.
    const next = el.querySelector<HTMLInputElement>('fc-safety-declaration input');
    expect(next?.checked).toBe(false);
    vi.useRealTimers();
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
  const edits = new Subject<MessageResponse>();
  const deletions = new Subject<{ messageId: string }>();
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    // The thread now hosts a ReportDialog, and jsdom implements <dialog> markup but not
    // showModal()/close() — stub the two methods the component calls.
    window.HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    window.HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    await configureAuthTestBed([Thread]);
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: 'c1' }));
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: paramMap$, snapshot: { paramMap: paramMap$.value } },
    });
    TestBed.overrideProvider(RealtimeService, {
      useValue: {
        message$: pushes.asObservable(),
        messageEdited$: edits.asObservable(),
        messageDeleted$: deletions.asObservable(),
        resync$: new Subject().asObservable(),
      },
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
