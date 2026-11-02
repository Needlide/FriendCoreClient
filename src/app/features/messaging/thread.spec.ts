import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { PostMedia } from '../../core/models/posts.models';
import { MessageReactionChangedPayload, MessageResponse } from '../../core/models/realtime.models';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { PreferencesService } from '../../core/preferences/preferences.service';
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
  reactions: MessageResponse['reactions'] = [],
  version = 0,
  replyTo: MessageResponse['replyTo'] = null,
  createdAt: string = new Date().toISOString(),
): MessageResponse {
  return {
    id,
    conversationId: 'c1',
    senderId,
    content,
    status: 'Sent',
    createdAt,
    media,
    editedAt: null,
    reactions,
    version,
    replyTo,
  };
}

/**
 * Clicks a per-bubble action-menu entry by its visible label. Deliberately not a positional
 * index: adding one item to the menu (React arrived that way) silently repoints every
 * `[1]` in the suite, and the tests then click Report while claiming to click Delete.
 */
function clickMenuItem(bubble: Element, label: string): void {
  const item = Array.from(
    bubble.querySelectorAll<HTMLButtonElement>('.actions [role=menuitem]'),
  ).find((button) => button.textContent?.trim() === label);
  if (!item) throw new Error(`No action-menu item labelled "${label}"`);
  item.click();
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
  const reactionPushes = new Subject<MessageReactionChangedPayload>();

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
        messageReaction$: reactionPushes.asObservable(),
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
    clickMenuItem(el.querySelectorAll('.bubble')[index], 'Edit');
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
    expect(req.request.body).toEqual({
      content: 'hey there',
      mediaId: null,
      replyToMessageId: null,
    });
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

  describe("Hiding somebody else's message", () => {
    /** Opens the menu on the nth bubble and picks "Hide". */
    function hideBubble(fixture: ComponentFixture<Thread>, index: number): void {
      clickMenuItem(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.bubble')[index],
        'Hide',
      );
      fixture.detectChanges();
    }

    it('offers Hide on their messages and not on your own', () => {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();

      const bubbles = el.querySelectorAll('.bubble');
      // page1 arrives newest-first but renders oldest-first, so bubbles[1] is bob's 'third'.
      const labels = (bubble: Element) =>
        Array.from(bubble.querySelectorAll('.actions [role=menuitem]')).map((b) =>
          b.textContent?.trim(),
        );

      expect(labels(bubbles[1])).toContain('Hide');
      expect(labels(bubbles[0])).not.toContain('Hide');
      expect(labels(bubbles[0])).toContain('Edit');
      expect(labels(bubbles[0])).toContain('Delete');
    });

    it('removes the bubble once the server confirms', () => {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();
      expect(el.textContent).toContain('third');

      hideBubble(fixture, 1);
      // Not removed optimistically: the request is still in flight.
      expect(el.textContent).toContain('third');

      // Asserted by verb as well as URL: hiding must not reuse DELETE, which is the
      // destructive one and would scrub the text for the sender too.
      const request = expectApi(http, '/conversations/c1/messages/m3/hide');
      expect(request.request.method).toBe('POST');
      request.flush(null);
      fixture.detectChanges();
      expect(el.textContent).not.toContain('third');
      expect(el.textContent).toContain('second');
    });

    it('keeps the bubble and says so when hiding fails', () => {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();

      hideBubble(fixture, 1);
      expectApi(http, '/conversations/c1/messages/m3/hide').flush(
        [{ code: 'Common.ServerError', description: 'Boom.' }],
        {
          status: 500,
          statusText: 'Server Error',
        },
      );
      fixture.detectChanges();

      expect(el.textContent).toContain('third');
      expect(el.textContent).toContain("Couldn't hide that message.");
    });

    it('does not let a later push put a hidden message back', () => {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();

      hideBubble(fixture, 1);
      expectApi(http, '/conversations/c1/messages/m3/hide').flush(null);
      fixture.detectChanges();
      expect(el.textContent).not.toContain('third');

      // The exact failure this guards: m3 is absent from the list, so plain dedupe reads it as
      // brand new and the bubble silently comes back.
      pushes.next({ ...message('m3', 'bob', 'third'), conversationId: 'c1' });
      expectApi(http, '/conversations/c1/read').flush(null);
      fixture.detectChanges();
      expect(el.textContent).not.toContain('third');
    });

    it('does not let a pushed edit put a hidden message back', () => {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();

      hideBubble(fixture, 1);
      expectApi(http, '/conversations/c1/messages/m3/hide').flush(null);
      fixture.detectChanges();

      edits.next({ ...message('m3', 'bob', 'rewritten'), conversationId: 'c1' });
      fixture.detectChanges();
      expect(el.textContent).not.toContain('rewritten');
    });

    it('does not let a delete push from the sender unblock a hidden id', () => {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();

      hideBubble(fixture, 1);
      expectApi(http, '/conversations/c1/messages/m3/hide').flush(null);
      fixture.detectChanges();

      // Harmless either way, but the hidden set must not be cleared by a tombstone for a message
      // this user never had on screen.
      deletions.next({ messageId: 'm3' });
      fixture.detectChanges();

      pushes.next({ ...message('m3', 'bob', 'third'), conversationId: 'c1' });
      expectApi(http, '/conversations/c1/read').flush(null);
      fixture.detectChanges();
      expect(el.textContent).not.toContain('third');
    });
  });

  describe('Searching the conversation', () => {
    /**
     * Matches the pending search request and asserts the term actually sent.
     *
     * <p>Cannot use the shared expectApi: Angular's TestRequest.url holds the path WITHOUT the
     * query string (urlWithParams has it), so an endsWith check on "...?q=needle" never matches.
     * Asserting the param separately also proves the term is what the box value became.
     */
    function expectSearch(term: string) {
      const request = http.expectOne(
        (r) => r.method === 'GET' && r.url.endsWith('/conversations/c1/messages/search'),
      );
      expect(request.request.params.get('q')).toBe(term);
      return request;
    }

    /** Types into the search box and runs the debounce. */
    function type(el: HTMLElement, value: string): void {
      const box = el.querySelector<HTMLInputElement>('#thread-search')!;
      box.value = value;
      box.dispatchEvent(new Event('input'));
    }

    function results(el: HTMLElement): string[] {
      return Array.from(el.querySelectorAll('.search-results li .text')).map(
        (node) => node.textContent?.trim() ?? '',
      );
    }

    it('does not search until the debounce elapses', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        type(el, 'needle');
        // Three letters is not a search: a request per keystroke would put the server round trip
        // inside the user's typing.
        expect(http.match((r) => r.url.includes('/messages/search'))).toEqual([]);

        vi.advanceTimersByTime(250);
        const request = expectSearch('needle');
        request.flush({ messages: [message('m9', 'bob', 'a needle here')], nextCursor: null });
        fixture.detectChanges();

        expect(results(el)).toEqual(['a needle here']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not search a single character', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        type(el, 'a');
        vi.advanceTimersByTime(250);

        // The server owns the minimum, so the client never asks. Asking would cost a round trip
        // only to be told the term was too short.
        expect(http.match((r) => r.url.includes('/messages/search'))).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it('distinguishes "no matches" from "not searched yet"', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        // Before any search: no empty-result message, because nothing has been asked.
        expect(el.textContent).not.toContain('No messages match');

        type(el, 'nothing here');
        vi.advanceTimersByTime(250);
        expectSearch('nothing here').flush({
          messages: [],
          nextCursor: null,
        });
        fixture.detectChanges();

        expect(el.textContent).toContain('No messages match "nothing here".');
      } finally {
        vi.useRealTimers();
      }
    });

    it('replaces the thread while active, and Clear brings it back', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();
        expect(el.textContent).toContain('third');

        type(el, 'third');
        vi.advanceTimersByTime(250);
        expectSearch('third').flush({
          messages: [message('m3', 'bob', 'third')],
          nextCursor: null,
        });
        fixture.detectChanges();

        // Results replace the timeline rather than interleaving with it — they are newest-first
        // and are not in the conversation's order.
        expect(results(el)).toEqual(['third']);
        expect(el.querySelectorAll('.messages li.bubble').length).toBe(0);

        el.querySelectorAll<HTMLButtonElement>('.search .clear')[0].click();
        fixture.detectChanges();

        expect(el.querySelectorAll('.messages li.bubble').length).toBe(2);
        expect(el.querySelectorAll('.search-results').length).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not let a slow earlier response overwrite a newer one', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        type(el, 'first term');
        vi.advanceTimersByTime(250);
        const stale = expectSearch('first term');

        type(el, 'second term');
        vi.advanceTimersByTime(250);
        const fresh = expectSearch('second term');

        // The first request answers last. If its result were applied, the panel would show
        // results for a term the user has already typed past.
        fresh.flush({ messages: [message('m9', 'bob', 'for the second term')], nextCursor: null });
        stale.flush({ messages: [message('m8', 'bob', 'for the first term')], nextCursor: null });
        fixture.detectChanges();

        expect(results(el)).toEqual(['for the second term']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('says so when the search itself fails', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        type(el, 'needle');
        vi.advanceTimersByTime(250);
        expectSearch('needle').flush([{ code: 'Common.ServerError', description: 'Boom.' }], {
          status: 500,
          statusText: 'Server Error',
        });
        fixture.detectChanges();

        expect(el.textContent).toContain("Couldn't search right now.");
        expect(el.querySelectorAll('.messages li.bubble').length).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Jumping to a search result', () => {
    /** Runs a search that finds one message, so there is something to click. */
    function searchFor(
      fixture: ComponentFixture<Thread>,
      el: HTMLElement,
      id: string,
      content: string,
    ): void {
      type(el, 'needle');
      vi.advanceTimersByTime(250);
      expectSearch('needle').flush({ messages: [message(id, 'bob', content)], nextCursor: null });
      fixture.detectChanges();
    }

    /**
     * Matches a paged read and asserts the cursor actually sent. Same reason as expectSearch:
     * Angular's TestRequest.url omits the query string, so an endsWith on a URL carrying
     * ?cursor=... can never match.
     */
    function expectPage(cursor: string) {
      const request = http.expectOne(
        (r) => r.method === 'GET' && r.url.endsWith('/conversations/c1/messages'),
      );
      expect(request.request.params.get('cursor')).toBe(cursor);
      return request;
    }

    /** Angular's TestRequest.url omits the query string, hence a dedicated matcher. */
    function expectSearch(term: string) {
      const request = http.expectOne(
        (r) => r.method === 'GET' && r.url.endsWith('/conversations/c1/messages/search'),
      );
      expect(request.request.params.get('q')).toBe(term);
      return request;
    }

    function type(el: HTMLElement, value: string): void {
      const box = el.querySelector<HTMLInputElement>('#thread-search')!;
      box.value = value;
      box.dispatchEvent(new Event('input'));
    }

    function clickFirstJump(el: HTMLElement): void {
      const button = el.querySelector<HTMLButtonElement>('.search-results .jump');
      if (!button) throw new Error('no jumpable search result');
      button.click();
    }

    it('replaces the thread with the window and says it is parked', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        searchFor(fixture, el, 'm3', 'a needle here');
        clickFirstJump(el);

        expectApi(http, '/conversations/c1/messages/m3/around').flush({
          messages: [
            message('m2', 'bob', 'just before'),
            message('m3', 'bob', 'a needle here'),
            message('m4', 'bob', 'just after'),
          ],
          olderCursor: 'older-1',
          newerCursor: 'newer-1',
        });
        fixture.detectChanges();

        // The window arrives oldest-first and must NOT be reversed — a reversed window still looks
        // plausible, which is what makes this worth asserting on content rather than on count.
        expect(bubbleTexts(el)).toEqual(['just before', 'a needle here', 'just after']);
        expect(el.textContent).toContain('Viewing an older part of this conversation.');
        // And the search panel is gone: it would cover the message it just found.
        expect(el.querySelectorAll('.search-results').length).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('highlights the message it jumped to', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        searchFor(fixture, el, 'm3', 'a needle here');
        clickFirstJump(el);
        expectApi(http, '/conversations/c1/messages/m3/around').flush({
          messages: [message('m3', 'bob', 'a needle here')],
          olderCursor: null,
          newerCursor: null,
        });
        fixture.detectChanges();

        expect(el.querySelectorAll('.bubble.jumped').length).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('offers no "Newer messages" button when the window reaches the end', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        searchFor(fixture, el, 'm3', 'a needle here');
        clickFirstJump(el);
        expectApi(http, '/conversations/c1/messages/m3/around').flush({
          messages: [message('m3', 'bob', 'a needle here')],
          olderCursor: 'older-1',
          newerCursor: null,
        });
        fixture.detectChanges();

        // A button that pages to nothing is worse than no button.
        expect(el.querySelectorAll('.newer').length).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('offers "Newer messages" when the window stops short of the end', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        searchFor(fixture, el, 'm3', 'a needle here');
        clickFirstJump(el);
        expectApi(http, '/conversations/c1/messages/m3/around').flush({
          messages: [message('m3', 'bob', 'a needle here')],
          olderCursor: null,
          newerCursor: 'newer-1',
        });
        fixture.detectChanges();

        expect(el.querySelectorAll('.newer').length).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('appends the next forward page instead of prepending it', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        searchFor(fixture, el, 'm3', 'a needle here');
        clickFirstJump(el);
        expectApi(http, '/conversations/c1/messages/m3/around').flush({
          messages: [message('m3', 'bob', 'a needle here')],
          olderCursor: null,
          newerCursor: 'newer-1',
        });
        fixture.detectChanges();

        el.querySelectorAll<HTMLButtonElement>('.newer')[0].click();
        // Newest-first from the server, reversed, then APPENDED.
        expectPage('newer-1').flush({
          messages: [message('m5', 'bob', 'newest'), message('m4', 'bob', 'middle')],
          nextCursor: null,
        });
        fixture.detectChanges();

        expect(bubbleTexts(el)).toEqual(['a needle here', 'middle', 'newest']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('says so when the message vanished between searching and clicking', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        searchFor(fixture, el, 'm3', 'a needle here');
        clickFirstJump(el);
        expectApi(http, '/conversations/c1/messages/m3/around').flush(
          [{ code: 'Messaging.MessageNotFound', description: 'gone.' }],
          {
            status: 404,
            statusText: 'Not Found',
          },
        );
        fixture.detectChanges();

        // Silently doing nothing would leave the reader wondering whether they clicked at all.
        expect(el.textContent).toContain('That message is no longer available.');
        // The thread they were reading is still there — a failed jump must not destroy it.
        expect(bubbleTexts(el)).toEqual(['second', 'third']);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns to the live end of the conversation', () => {
      vi.useFakeTimers();
      try {
        const { fixture, el } = create();
        loadLatest();
        fixture.detectChanges();

        searchFor(fixture, el, 'm3', 'a needle here');
        clickFirstJump(el);
        expectApi(http, '/conversations/c1/messages/m3/around').flush({
          messages: [message('m3', 'bob', 'a needle here')],
          olderCursor: null,
          newerCursor: 'newer-1',
        });
        fixture.detectChanges();

        const back = Array.from(el.querySelectorAll<HTMLButtonElement>('.parked button')).find(
          (b) => b.textContent?.includes('Back to latest'),
        );
        back!.click();

        expectApi(http, '/conversations/c1/messages').flush(page1);
        expectApi(http, '/conversations/c1/read').flush(null);
        fixture.detectChanges();

        expect(el.textContent).not.toContain('Viewing an older part');
        expect(el.querySelectorAll('.newer').length).toBe(0);
        expect(bubbleTexts(el)).toEqual(['second', 'third']);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Date dividers', () => {
    /** A timestamp `days` ago at a fixed local hour, so no test depends on the clock's time of day. */
    function daysAgo(days: number, hour = 12): string {
      const date = new Date();
      date.setDate(date.getDate() - days);
      date.setHours(hour, 0, 0, 0);
      return date.toISOString();
    }

    function dividerTexts(el: HTMLElement): string[] {
      return Array.from(el.querySelectorAll('.day-divider')).map(
        (node) => node.textContent?.trim() ?? '',
      );
    }

    function load(el: HTMLElement, messages: MessageResponse[]): void {
      expectApi(http, '/conversations/c1/messages').flush({ messages, nextCursor: null });
      expectApi(http, '/conversations/c1/read').flush(null);
    }

    it('puts one divider before the first message', () => {
      const { fixture, el } = create();
      load(el, [message('m1', 'bob', 'first thing')]);
      fixture.detectChanges();

      expect(dividerTexts(el)).toEqual(['Today']);
    });

    it('does not repeat a divider within the same day', () => {
      const { fixture, el } = create();
      load(el, [
        message('m1', 'bob', 'morning', null, [], 0, null, daysAgo(0, 9)),
        message('m2', 'bob', 'midday', null, [], 0, null, daysAgo(0, 13)),
        message('m3', 'bob', 'evening', null, [], 0, null, daysAgo(0, 21)),
      ]);
      fixture.detectChanges();

      expect(dividerTexts(el)).toEqual(['Today']);
    });

    it('breaks the day across midnight rather than every 24 hours', () => {
      const { fixture, el } = create();
      // 23:50 and 00:10 the next morning are two hours apart but two different days — the case a
      // rolling 24-hour window gets wrong, showing one divider for both.
      const late = new Date();
      late.setHours(23, 50, 0, 0);
      const early = new Date(late);
      early.setDate(early.getDate() + 1);
      early.setHours(0, 10, 0, 0);

      load(el, [
        message('m1', 'bob', 'still up', null, [], 0, null, late.toISOString()),
        message('m2', 'bob', 'awake', null, [], 0, null, early.toISOString()),
      ]);
      fixture.detectChanges();

      expect(dividerTexts(el)).toHaveLength(2);
    });

    it('names yesterday and the days before it', () => {
      const { fixture, el } = create();
      // Newest first, as the feed always is — the thread reverses it.
      load(el, [
        message('m2', 'bob', 'newer', null, [], 0, null, daysAgo(0)),
        message('m1', 'bob', 'old', null, [], 0, null, daysAgo(3)),
      ]);
      fixture.detectChanges();

      const labels = dividerTexts(el);
      expect(labels).toHaveLength(2);
      expect(labels[1]).toBe('Today');
      // Three days back is a weekday name, not a date — that is the rule under test.
      expect(labels[0]).not.toBe('Today');
      expect(labels[0]).not.toBe('Yesterday');
    });

    it('names yesterday specifically', () => {
      const { fixture, el } = create();
      load(el, [
        message('m2', 'bob', 'today', null, [], 0, null, daysAgo(0)),
        message('m1', 'bob', 'yesterday', null, [], 0, null, daysAgo(1)),
      ]);
      fixture.detectChanges();

      expect(dividerTexts(el)).toEqual(['Yesterday', 'Today']);
    });
  });

  describe('Scroll anchoring', () => {
    /**
     * jsdom reports every element as zero-sized, so scrollHeight/clientHeight are read-only
     * zeros and the real geometry cannot be exercised. What IS testable — and what the bugs
     * actually were — is the DECISION: whether the code tries to move the scroll position, tries
     * to hold an anchor, or deliberately leaves it alone. Each case gets a stubbed element.
     */
    function stubList(scrollHeight: number): HTMLUListElement {
      const element = document.createElement('ul') as HTMLUListElement;
      let top = 0;
      Object.defineProperty(element, 'scrollHeight', {
        get: () => scrollHeight,
        configurable: true,
      });
      Object.defineProperty(element, 'clientHeight', { get: () => 100, configurable: true });
      Object.defineProperty(element, 'scrollTop', {
        get: () => top,
        set: (value: number) => (top = value),
        configurable: true,
      });
      return element;
    }

    /**
     * The component's state and template ref are protected/private, which is right for production
     * and hostile to a test that has to drive them. Reached through a cast rather than by
     * loosening the modifiers — the alternative is a public API that exists only for tests.
     */
    interface ThreadInternals {
      messages: { set(value: MessageResponse[]): void };
      unseenBelow: () => number;
      messageList: () => { nativeElement: HTMLUListElement };
      lastFirstId: string | null;
      lastLastId: string | null;
      lastMessageCount: number;
      lastScrollHeight: number;
    }

    function internals(fixture: ComponentFixture<Thread>): ThreadInternals {
      return fixture.componentInstance as unknown as ThreadInternals;
    }

    function setList(fixture: ComponentFixture<Thread>, element: HTMLUListElement): void {
      internals(fixture).messageList = () => ({ nativeElement: element });
    }

    it('opens the thread at the newest message', () => {
      const { fixture } = create();
      loadLatest();
      const list = stubList(2000);
      setList(fixture, list);

      internals(fixture).messages.set([message('m1', 'bob', 'only')]);
      fixture.detectChanges();

      expect(list.scrollTop).toBe(2000);
    });

    it('holds its position when older messages are prepended', () => {
      const { fixture } = create();
      loadLatest();
      internals(fixture).lastFirstId = 'm2';
      internals(fixture).lastLastId = 'm3';
      internals(fixture).lastMessageCount = 2;
      internals(fixture).lastScrollHeight = 1000;

      // Prepending grew the list by 300px; the reader must be moved down by exactly that, or the
      // message they were looking at jumps to the top of the viewport.
      const list = stubList(1300);
      setList(fixture, list);

      internals(fixture).messages.set([
        message('m1', 'bob', 'older'),
        message('m2', 'me', 'middle'),
        message('m3', 'bob', 'newest'),
      ]);
      fixture.detectChanges();

      expect(list.scrollTop).toBe(300);
    });

    it('leaves the reader alone when a message arrives and they are scrolled up', () => {
      const { fixture } = create();
      loadLatest();
      internals(fixture).lastFirstId = 'm2';
      internals(fixture).lastLastId = 'm3';
      internals(fixture).lastMessageCount = 2;
      internals(fixture).lastScrollHeight = 2000;

      const list = stubList(2000);
      setList(fixture, list);
      list.scrollTop = 0;

      internals(fixture).messages.set([
        message('m2', 'me', 'middle'),
        message('m3', 'bob', 'newest'),
        message('m9', 'bob', 'just arrived'),
      ]);
      fixture.detectChanges();

      // Yanking someone out of what they are reading to show them something unasked is the classic
      // chat annoyance. Count it instead and let them choose.
      expect(list.scrollTop).toBe(0);
      expect(internals(fixture).unseenBelow()).toBe(1);
    });

    it('sticks to the bottom when a message arrives and they are already there', () => {
      const { fixture } = create();
      loadLatest();
      internals(fixture).lastFirstId = 'm2';
      internals(fixture).lastLastId = 'm3';
      internals(fixture).lastMessageCount = 2;
      internals(fixture).lastScrollHeight = 2000;

      const list = stubList(2000);
      setList(fixture, list);
      list.scrollTop = 1900; // within the bottom slack

      internals(fixture).messages.set([
        message('m2', 'me', 'middle'),
        message('m3', 'bob', 'newest'),
        message('m9', 'bob', 'just arrived'),
      ]);
      fixture.detectChanges();

      expect(list.scrollTop).toBe(2000);
      expect(internals(fixture).unseenBelow()).toBe(0);
    });
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
    safetyFlags: {},
    variants: [
      { type: 'Small', url: 'http://storage.test/small.webp', widthPx: 300, heightPx: 200 },
    ],
    gateReason: null,
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
      expect(req.request.body).toEqual({ content: null, mediaId: 'med9', replyToMessageId: null });
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

    // React leads every bubble's menu: it applies to anything in the thread, where edit and
    // delete are the sender's alone and a self-report is never offered. Hide is theirs alone for
    // the mirror-image reason — there is nothing to withdraw from your own view.
    expect(labels(mine)).toEqual(['React', 'Reply', 'Edit', 'Delete']);
    expect(labels(theirs)).toEqual(['React', 'Reply', 'Hide', 'Report']);
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
    expect(items).toEqual(['React', 'Reply', 'Delete']);
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
    // The version the editor was opened against travels with the text: without it the server
    // cannot tell a fresh reword from one based on a view that has since moved on.
    expect(req.request.body).toEqual({ content: 'second, corrected', version: 0 });
    req.flush({
      ...message('m2', 'me', 'second, corrected'),
      editedAt: new Date().toISOString(),
      version: 1,
    });
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
    clickMenuItem(el.querySelectorAll('.bubble')[0], 'Delete');
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

    clickMenuItem(el.querySelectorAll('.bubble')[0], 'Delete');
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
    clickMenuItem(el.querySelectorAll('.bubble')[1], 'Report');
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
      // One JSON dictionary: the sender can say "one of these might apply", not which.
      const form = upload.request.body as FormData;
      expect(form.get('SafetyFlags')).toBe(
        JSON.stringify({
          flashing: true,
          intenseMotion: true,
          arachnophobia: false,
          explicit: false,
        }),
      );

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

  it('sends every hazard flag as false when nothing is declared', () => {
    vi.useFakeTimers();
    try {
      const { fixture, el } = create();
      loadLatest();
      fixture.detectChanges();

      attachImage(el);
      fixture.detectChanges();
      const upload = expectApi(http, '/media');
      const form = upload.request.body as FormData;
      expect(form.get('SafetyFlags')).toBe(
        JSON.stringify({
          flashing: false,
          intenseMotion: false,
          arachnophobia: false,
          explicit: false,
        }),
      );

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

  it('offers "Report image" only on someone elses message that carries media', () => {
    const { fixture, el } = create();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [
        message('m1', 'me', null, media),
        message('m2', 'bob', 'look', media),
        message('m3', 'bob', 'no image here'),
      ],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();

    const labels = (index: number) =>
      Array.from(
        el.querySelectorAll('.bubble')[index].querySelectorAll('.actions [role=menuitem]'),
      ).map((b) => b.textContent?.trim());

    // The feed is newest-first and the thread reverses it, so oldest-at-top means:
    // m3 (theirs, text only) → m2 (theirs, with media) → m1 (mine, media, no text).
    expect(labels(0)).toEqual(['React', 'Reply', 'Hide', 'Report']);
    expect(labels(1)).toEqual(['React', 'Reply', 'Hide', 'Report', 'Report image']);
    // Your own upload is not reportable, and a text-only bubble has no image to report —
    // and an attachment-only bubble has no text to edit.
    expect(labels(2)).toEqual(['React', 'Reply', 'Delete']);
  });

  it('posts a media report to the media endpoint, not the message one', () => {
    const { fixture, el } = create();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [message('m2', 'bob', 'look', media)],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();

    clickMenuItem(el.querySelectorAll('.bubble')[0], 'Report image');
    fixture.detectChanges();

    const dialog = el.querySelector<HTMLDialogElement>('fc-report-dialog dialog')!;
    expect(dialog.open).toBe(true);
    dialog.querySelector<HTMLInputElement>('input[type=radio]')!.click();
    fixture.detectChanges();
    dialog.querySelector<HTMLButtonElement>('.actions .fc-primary')!.click();

    // Reporting the image, not the bubble: a removed message would leave the media row
    // alive and re-sendable.
    const req = http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith(`/media/${media.id}/report`),
    );
    expect(req.request.body.category).toBeTruthy();
    req.flush(null);
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
  const reactionPushes = new Subject<MessageReactionChangedPayload>();
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
        messageReaction$: reactionPushes.asObservable(),
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

describe('Thread reactions', () => {
  let http: HttpTestingController;
  const pushes = new Subject<MessageResponse>();
  const edits = new Subject<MessageResponse>();
  const deletions = new Subject<{ messageId: string }>();
  const reactionPushes = new Subject<MessageReactionChangedPayload>();

  beforeEach(async () => {
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
        messageReaction$: reactionPushes.asObservable(),
        resync$: new Subject().asObservable(),
      },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => http.verify());

  /** A loaded thread: bob's bubble (m1) second, carrying the given chips. */
  function create(reactions: MessageResponse['reactions'] = []) {
    const fixture = TestBed.createComponent(Thread);
    fixture.detectChanges();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [message('m2', 'me', 'mine'), message('m1', 'bob', 'theirs', null, reactions)],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** Bob's bubble — the recipient's, so it has no edit or delete of its own. */
  function theirBubble(el: HTMLElement): Element {
    return el.querySelectorAll('.bubble')[0];
  }

  function chips(el: HTMLElement): HTMLButtonElement[] {
    return Array.from(theirBubble(el).querySelectorAll<HTMLButtonElement>('.reactions .chip'));
  }

  /**
   * Drives the picker through the action menu — the keyboard and touch path, the same one
   * the ⋯ menu is for. The label flips to "Close reactions" while open, so both are
   * accepted rather than reaching past the menu into private component state.
   */
  function togglePicker(fixture: { detectChanges(): void }, el: HTMLElement): void {
    const bubble = theirBubble(el);
    const item = Array.from(
      bubble.querySelectorAll<HTMLButtonElement>('.actions [role=menuitem]'),
    ).find((b) => ['React', 'Close reactions'].includes(b.textContent?.trim() ?? ''));
    if (!item) throw new Error('No React item in the action menu');
    item.click();
    fixture.detectChanges();
  }

  /** The single POST a tap sends. */
  function reactionRequest() {
    return http.expectOne(
      (r) => r.method === 'POST' && r.url.endsWith('/conversations/c1/messages/m1/reactions'),
    );
  }

  it('renders no chips and no picker for an unreacted message', () => {
    const { el } = create();
    expect(chips(el)).toHaveLength(0);
    expect(theirBubble(el).querySelector('.picker')).toBeNull();
  });

  it('renders existing chips with their counts, pressed only when mine', () => {
    const { el } = create([
      { emoji: '😂', count: 2, reacted: true },
      { emoji: '👍', count: 1, reacted: false },
    ]);

    const rendered = chips(el);
    expect(rendered).toHaveLength(2);
    expect(rendered[0].textContent).toContain('😂');
    expect(rendered[0].textContent).toContain('2');
    // aria-pressed carries the state as well as the highlight, so it is not colour-only.
    expect(rendered[0].getAttribute('aria-pressed')).toBe('true');
    expect(rendered[0].classList).toContain('mine');
    expect(rendered[1].getAttribute('aria-pressed')).toBe('false');
    expect(rendered[1].classList).not.toContain('mine');
  });

  it('labels chips with the count for screen readers', () => {
    const { el } = create([{ emoji: '😂', count: 2, reacted: false }]);
    expect(chips(el)[0].getAttribute('aria-label')).toContain('2 in total');
    // The glyph itself is hidden from the reader — "😂" read aloud says nothing useful.
    expect(chips(el)[0].querySelector('.glyph')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('opens the picker from the action menu, not from hover', () => {
    const { fixture, el } = create();
    togglePicker(fixture, el);

    const picker = theirBubble(el).querySelectorAll('.picker .chip');
    expect(picker.length).toBeGreaterThan(0);
    expect(picker[0].getAttribute('aria-label')).toContain('React with');
  });

  it('toggles the picker closed again', () => {
    const { fixture, el } = create();
    togglePicker(fixture, el);
    expect(theirBubble(el).querySelector('.picker')).not.toBeNull();

    togglePicker(fixture, el);
    expect(theirBubble(el).querySelector('.picker')).toBeNull();
  });

  it('moves the chip optimistically and then defers to the server count', () => {
    const { fixture, el } = create();
    togglePicker(fixture, el);

    theirBubble(el).querySelector<HTMLButtonElement>('.picker .chip')!.click();
    fixture.detectChanges();

    // Rendered before the response lands: a tap must not feel like it is waiting on the network.
    expect(chips(el)).toHaveLength(1);
    expect(chips(el)[0].textContent).toContain('1');

    const request = reactionRequest();
    expect(request.request.body).toEqual({ emoji: '👍' });

    // The server's count wins, so a tap from the other side that landed in between is kept.
    request.flush({ emoji: '👍', count: 3, reacted: true });
    fixture.detectChanges();
    expect(chips(el)[0].textContent).toContain('3');
  });

  it('takes the reaction back on a second tap and drops a zero chip', () => {
    const { fixture, el } = create([{ emoji: '👍', count: 1, reacted: true }]);

    chips(el)[0].click();
    fixture.detectChanges();

    // Would be 0: the chip goes rather than lingering as a bare "0", and there is no tombstone.
    expect(chips(el)).toHaveLength(0);

    reactionRequest().flush({ emoji: '👍', count: 0, reacted: false });
    fixture.detectChanges();
    expect(chips(el)).toHaveLength(0);
  });

  it('rolls the chip back and explains when the toggle fails', () => {
    const { fixture, el } = create([{ emoji: '👍', count: 1, reacted: true }]);

    chips(el)[0].click();
    fixture.detectChanges();
    expect(chips(el)).toHaveLength(0);

    reactionRequest().flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // The chip is back and the reason is on screen, rather than the tap being a silent no-op.
    expect(chips(el)).toHaveLength(1);
    expect(chips(el)[0].textContent).toContain('1');
    expect(el.textContent).toContain("Couldn't save that reaction");
  });

  it('ignores a second tap while the first is still in flight', () => {
    const { fixture, el } = create();
    togglePicker(fixture, el);

    theirBubble(el).querySelector<HTMLButtonElement>('.picker .chip')!.click();
    fixture.detectChanges();

    // Disabled in flight: the optimistic toggle already moved the chip, so a second tap
    // would compute a third state out of the first one's answer.
    expect(chips(el)[0].disabled).toBe(true);

    reactionRequest().flush({ emoji: '👍', count: 1, reacted: true });
    fixture.detectChanges();
    expect(chips(el)[0].disabled).toBe(false);
  });

  it('applies a pushed reaction to the one chip it names', () => {
    const { fixture, el } = create();
    togglePicker(fixture, el);

    reactionPushes.next({ messageId: 'm1', emoji: '😂', count: 1, reacted: false });
    fixture.detectChanges();

    expect(chips(el)).toHaveLength(1);
    expect(chips(el)[0].textContent).toContain('😂');
    // Bob reacted, not us — visible, but not marked as mine.
    expect(chips(el)[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('drops the chip when a pushed reaction falls to zero', () => {
    const { fixture, el } = create([{ emoji: '😂', count: 1, reacted: true }]);

    reactionPushes.next({ messageId: 'm1', emoji: '😂', count: 0, reacted: false });
    fixture.detectChanges();

    expect(chips(el)).toHaveLength(0);
  });

  it('ignores a push for a message this thread is not showing', () => {
    const { fixture, el } = create();

    // Another conversation, or a page this thread has not loaded: message ids are globally
    // unique, so membership is the whole test — the same reasoning the delete push uses.
    reactionPushes.next({ messageId: 'somewhere-else', emoji: '😂', count: 1, reacted: true });
    fixture.detectChanges();

    expect(chips(el)).toHaveLength(0);
  });

  it('re-sorts the row after a local tap, matching the server order', () => {
    // A page arrives in the server's order (count desc, then picker order) and is rendered
    // as given — REST is canonical, so the client does not re-sort on read. What the client
    // DOES own is the order after its own optimistic tap, and that has to agree with the
    // server's or the row would visibly reshuffle on the next reconcile.
    const { fixture, el } = create([
      { emoji: '👍', count: 2, reacted: false },
      { emoji: '😂', count: 1, reacted: false },
    ]);
    expect(chips(el).map((c) => c.textContent?.replace(/\s/g, ''))).toEqual(['👍2', '😂1']);

    // Tapping the weaker chip makes it 2, so it overtakes the first.
    chips(el)[1].click();
    fixture.detectChanges();
    reactionRequest().flush({ emoji: '😂', count: 2, reacted: true });
    fixture.detectChanges();

    expect(chips(el).map((c) => c.textContent?.replace(/\s/g, ''))).toEqual(['👍2', '😂2']);

    // Tapping a chip you do not hold adds your reaction to it, so 👍 overtakes the tie.
    chips(el)[0].click();
    fixture.detectChanges();
    reactionRequest().flush({ emoji: '👍', count: 3, reacted: true });
    fixture.detectChanges();
    expect(chips(el).map((c) => c.textContent?.replace(/\s/g, ''))).toEqual(['👍3', '😂2']);
  });

  it('keeps its chips when another message is pushed into the thread', () => {
    const { fixture, el } = create();
    togglePicker(fixture, el);
    theirBubble(el).querySelector<HTMLButtonElement>('.picker .chip')!.click();
    fixture.detectChanges();
    reactionRequest().flush({ emoji: '👍', count: 1, reacted: true });
    fixture.detectChanges();
    expect(chips(el)).toHaveLength(1);

    // A later push merges alongside the chips rather than replacing the message wholesale.
    // It also fires the thread's own mark-read beacon for a message in this conversation.
    pushes.next(message('m3', 'bob', 'newer'));
    fixture.detectChanges();
    expectApi(http, '/conversations/c1/read').flush(null);
    expect(chips(el)).toHaveLength(1);
  });

  it('closes the picker when the message it belongs to is deleted', () => {
    const { fixture, el } = create();
    togglePicker(fixture, el);
    expect(theirBubble(el).querySelector('.picker')).not.toBeNull();

    deletions.next({ messageId: 'm1' });
    fixture.detectChanges();

    // Nothing left to attach a picker to.
    expect(el.querySelector('.picker')).toBeNull();
  });
});

describe('Thread edit conflicts', () => {
  let http: HttpTestingController;
  const pushes = new Subject<MessageResponse>();
  const edits = new Subject<MessageResponse>();
  const deletions = new Subject<{ messageId: string }>();
  const reactionPushes = new Subject<MessageReactionChangedPayload>();

  beforeEach(async () => {
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
        messageReaction$: reactionPushes.asObservable(),
        resync$: new Subject().asObservable(),
      },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => http.verify());

  /** Loads a thread whose own message `m2` carries the given version. */
  function create(version = 0) {
    const fixture = TestBed.createComponent(Thread);
    fixture.detectChanges();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [message('m2', 'me', 'second', null, [], version)],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** Opens the inline editor on our own bubble and types a reword. */
  function reword(fixture: { detectChanges(): void }, el: HTMLElement, text: string) {
    clickMenuItem(el.querySelectorAll('.bubble')[0], 'Edit');
    fixture.detectChanges();
    const box = el.querySelector<HTMLTextAreaElement>('.editor textarea')!;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.editor-actions .fc-primary')!.click();
    fixture.detectChanges();
    return http.expectOne((r) => r.method === 'PATCH');
  }

  it('sends the version the editor was opened against', () => {
    const { fixture, el } = create(3);
    const req = reword(fixture, el, 'a careful reword');

    expect(req.request.body).toEqual({ content: 'a careful reword', version: 3 });
    req.flush({ ...message('m2', 'me', 'a careful reword'), editedAt: null, version: 4 });
    fixture.detectChanges();
  });

  it('keeps the draft, explains, and pulls the winning wording on 409', () => {
    const { fixture, el } = create(0);
    const req = reword(fixture, el, 'my careful reword');

    req.flush(
      { errors: { messageId: ['Messaging.MessageChanged'] } },
      { status: 409, statusText: 'Conflict' },
    );
    // The refetch that a conflict forces: without it the client keeps a stale version and every
    // retry conflicts identically.
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [message('m2', 'me', 'what the other device saved', null, [], 1)],
      nextCursor: null,
    });
    fixture.detectChanges();

    // The draft is untouched — the user does not lose what they typed.
    const box = el.querySelector<HTMLTextAreaElement>('.editor textarea')!;
    expect(box.value).toBe('my careful reword');
    // The editor stays open, and says why rather than a bare "try again" that cannot work.
    const error = el.querySelector('.editor-error')!.textContent ?? '';
    expect(error).toContain('another device');
    expect(error).not.toContain("Couldn't save");

    // The wording that won is shown INSIDE the editor — the open editor otherwise replaces the
    // bubble body, so without this the refetched text would be fetched and then invisible.
    const current = el.querySelector('.editor-current');
    expect(current?.textContent).toContain('Currently saved');
    expect(current?.textContent).toContain('what the other device saved');
    // And the bubble is not showing the optimistic wording, which was never accepted.
    expect(bubbleTextOf(el)).not.toContain('my careful reword');
  });

  it('saves successfully when the user chooses to overwrite after reading the other wording', () => {
    const { fixture, el } = create(0);
    const conflicted = reword(fixture, el, 'my careful reword');
    conflicted.flush({}, { status: 409, statusText: 'Conflict' });
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [message('m2', 'me', 'theirs', null, [], 1)],
      nextCursor: null,
    });
    fixture.detectChanges();

    // The copy says saving again replaces theirs. It has to, and only because the refetch
    // put the current version back on the bubble the editor is bound to.
    const retry = el.querySelector<HTMLButtonElement>('.editor-actions .fc-primary')!;
    retry.click();
    fixture.detectChanges();
    const req = http.expectOne((r) => r.method === 'PATCH');
    expect(req.request.body).toEqual({ content: 'my careful reword', version: 1 });
    req.flush({ ...message('m2', 'me', 'my careful reword'), editedAt: null, version: 2 });
    fixture.detectChanges();

    expect(el.querySelector('.editor')).toBeNull();
    expect(bubbleTextOf(el)).toContain('my careful reword');
  });

  it('clears the conflict copy when the editor is reopened', () => {
    const { fixture, el } = create(0);
    const req = reword(fixture, el, 'first attempt');
    req.flush({}, { status: 409, statusText: 'Conflict' });
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [message('m2', 'me', 'theirs', null, [], 1)],
      nextCursor: null,
    });
    fixture.detectChanges();
    expect(el.querySelector('.editor-error')?.textContent).toContain('another device');

    el.querySelector<HTMLButtonElement>('.editor-actions .fc-secondary')!.click();
    fixture.detectChanges();

    clickMenuItem(el.querySelectorAll('.bubble')[0], 'Edit');
    fixture.detectChanges();
    expect(el.querySelector('.editor-error')).toBeNull();
  });

  it('does not claim a conflict for an ordinary failure', () => {
    const { fixture, el } = create(0);
    const req = reword(fixture, el, 'a reword');
    req.flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // A 500 is transient: the version is still current, so the honest advice really is to try
    // again — and no refetch is needed or made.
    expect(el.querySelector('.editor-error')?.textContent).toContain("Couldn't save");
    http.expectNone((r) => r.method === 'GET' && r.url.endsWith('/conversations/c1/messages'));
  });

  it('adopts the version from an edit pushed by the same account elsewhere', () => {
    const { fixture, el } = create(0);

    // The other device's save arrives over the hub, so the bubble already holds the new
    // version — the next edit from here must not conflict with it.
    edits.next({ ...message('m2', 'me', 'saved on the phone', null, [], 1) });
    fixture.detectChanges();

    const req = reword(fixture, el, 'then this');
    expect(req.request.body).toEqual({ content: 'then this', version: 1 });
    req.flush({ ...message('m2', 'me', 'then this'), editedAt: null, version: 2 });
    fixture.detectChanges();
  });
});

/** The first bubble's text, excluding the editor that may be open on it. */
function bubbleTextOf(el: HTMLElement): string {
  return el.querySelectorAll('.bubble')[0].textContent ?? '';
}

/**
 * The composer's send key. Both directions are user-facing behaviour people notice
 * immediately when it is wrong, and the suite had no key-handling coverage at all before
 * this — every other send test drives the submit button, which would have kept passing with
 * the Enter binding deleted entirely.
 */
describe('Thread composer send key', () => {
  let http: HttpTestingController;
  let sendOnEnter: boolean;
  const pushes = new Subject<MessageResponse>();
  const edits = new Subject<MessageResponse>();
  const deletions = new Subject<{ messageId: string }>();
  const reactionPushes = new Subject<MessageReactionChangedPayload>();

  beforeEach(async () => {
    sendOnEnter = true;
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
        messageReaction$: reactionPushes.asObservable(),
        resync$: new Subject().asObservable(),
      },
    });
    // The composer reads one computed off the real service; stubbing the value keeps the
    // preference out of these tests' HTTP budget.
    TestBed.overrideProvider(PreferencesService, {
      useValue: { sendMessageOnEnter: () => sendOnEnter },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Thread);
    fixture.detectChanges();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [message('m2', 'me', 'mine')],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function type(fixture: { detectChanges(): void }, el: HTMLElement, text: string) {
    const box = el.querySelector<HTMLTextAreaElement>('#thread-draft')!;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    return box;
  }

  /** Fires a keydown on the composer, carrying only the modifiers a test names. */
  function press(
    fixture: { detectChanges(): void },
    box: HTMLTextAreaElement,
    init: KeyboardEventInit,
  ) {
    // cancelable, or preventDefault() is a no-op and defaultPrevented can never be true —
    // which would quietly make the "we stopped the newline" assertion meaningless.
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
      ...init,
    });
    box.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  /** The POST a send produces, or undefined when nothing was sent. */
  function sentMessage(): unknown {
    const matches = http.match((r) => r.method === 'POST' && r.url.endsWith('/messages'));
    return matches[0]?.request.body ?? undefined;
  }

  describe('when Enter sends (the default)', () => {
    it('sends on a bare Enter', () => {
      const { fixture, el } = create();
      const box = type(fixture, el, 'hello');

      const event = press(fixture, box, {});

      expect(sentMessage()).toEqual({ content: 'hello', mediaId: null, replyToMessageId: null });
      // preventDefault is what stops the newline being inserted as well as sending.
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves Shift+Enter to insert a newline', () => {
      const { fixture, el } = create();
      const box = type(fixture, el, 'hello');

      const event = press(fixture, box, { shiftKey: true });

      expect(sentMessage()).toBeUndefined();
      // Not prevented: the textarea's own newline behaviour must survive untouched.
      expect(event.defaultPrevented).toBe(false);
    });

    it('also sends on Ctrl+Enter', () => {
      const { fixture, el } = create();
      const box = type(fixture, el, 'hello');

      press(fixture, box, { ctrlKey: true });

      // A user reaching for the modifier should not be stranded by the default mode.
      expect(sentMessage()).toEqual({ content: 'hello', mediaId: null, replyToMessageId: null });
    });

    it('also sends on Cmd+Enter', () => {
      const { fixture, el } = create();
      const box = type(fixture, el, 'hello');

      press(fixture, box, { metaKey: true });

      expect(sentMessage()).toEqual({ content: 'hello', mediaId: null, replyToMessageId: null });
    });
  });

  describe('when the user prefers a modifier to send', () => {
    beforeEach(() => {
      sendOnEnter = false;
    });

    it('leaves a bare Enter to insert a newline', () => {
      const { fixture, el } = create();
      const box = type(fixture, el, 'line one');

      const event = press(fixture, box, {});

      // The whole point of the preference: Enter must not send here, and must not be
      // swallowed either, or the user could not type a second line at all.
      expect(sentMessage()).toBeUndefined();
      expect(event.defaultPrevented).toBe(false);
    });

    it('sends on Ctrl+Enter', () => {
      const { fixture, el } = create();
      const box = type(fixture, el, 'line one');

      press(fixture, box, { ctrlKey: true });

      expect(sentMessage()).toEqual({ content: 'line one', mediaId: null, replyToMessageId: null });
    });

    it('sends on Cmd+Enter', () => {
      const { fixture, el } = create();
      const box = type(fixture, el, 'line one');

      press(fixture, box, { metaKey: true });

      // On a Mac the key under the spacebar is Cmd, so this is the combination the user who
      // asked for this option is actually pressing.
      expect(sentMessage()).toEqual({ content: 'line one', mediaId: null, replyToMessageId: null });
    });
  });

  it('ignores keys that are not Enter', () => {
    const { fixture, el } = create();
    const box = type(fixture, el, 'hello');

    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    box.dispatchEvent(event);
    fixture.detectChanges();

    expect(sentMessage()).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not send an empty draft', () => {
    const { fixture, el } = create();
    type(fixture, el, '   ');

    press(fixture, el.querySelector<HTMLTextAreaElement>('#thread-draft')!, {});

    // canSend() already refuses this, so the key must not bypass that guard either.
    expect(sentMessage()).toBeUndefined();
  });
});

describe('Thread replies', () => {
  let http: HttpTestingController;
  const pushes = new Subject<MessageResponse>();
  const edits = new Subject<MessageResponse>();
  const deletions = new Subject<{ messageId: string }>();
  const reactionPushes = new Subject<MessageReactionChangedPayload>();

  beforeEach(async () => {
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
        messageReaction$: reactionPushes.asObservable(),
        resync$: new Subject().asObservable(),
      },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => http.verify());

  /** bob's message plus a reply to it, both loaded. */
  function create(reply = true) {
    const fixture = TestBed.createComponent(Thread);
    fixture.detectChanges();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: reply
        ? [
            message('m3', 'me', 'agreed', null, [], 0, {
              id: 'm1',
              senderId: 'bob',
              excerpt: 'was it?',
              wasDeleted: false,
            }),
            message('m1', 'bob', 'was it?'),
          ]
        : [message('m1', 'bob', 'was it?')],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function quoteBlocks(el: HTMLElement): HTMLElement[] {
    return Array.from(el.querySelectorAll<HTMLElement>('.bubble .quote'));
  }

  function openReply(fixture: { detectChanges(): void }, el: HTMLElement): void {
    clickMenuItem(theirBubbleOf(el), 'Reply');
    fixture.detectChanges();
  }

  function theirBubbleOf(el: HTMLElement): Element {
    // bubbles render oldest-first: m1 then m3.
    return el.querySelectorAll('.bubble')[0];
  }

  it('renders no quote on an ordinary message', () => {
    const { el } = create(false);
    expect(quoteBlocks(el)).toHaveLength(0);
    expect(el.querySelector('.replying')).toBeNull();
  });

  it('renders the quoted excerpt on a reply', () => {
    const { el } = create();

    const quotes = quoteBlocks(el);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].textContent).toContain('was it?');
    expect(quotes[0].textContent).toContain('Replying to');
  });

  it('offers Reply on every bubble', () => {
    const { el } = create();
    for (const bubble of Array.from(el.querySelectorAll('.bubble'))) {
      expect(bubble.querySelector('.actions [role=menuitem]')?.textContent?.trim()).toBeTruthy();
    }
    // Including on a message that is itself a reply: quoting goes one level deep at most.
    expect(el.textContent).toContain('Reply');
  });

  it('sends the reply target, and clears the bar', () => {
    const { fixture, el } = create(false);
    openReply(fixture, el);
    expect(el.querySelector('.replying')?.textContent).toContain('was it?');

    const box = el.querySelector<HTMLTextAreaElement>('#thread-draft')!;
    box.value = 'agreed';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();

    const req = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/messages'));
    expect(req.request.body).toEqual({
      content: 'agreed',
      mediaId: null,
      replyToMessageId: 'm1',
    });
    req.flush({ ...message('m4', 'me', 'agreed') });
    // The successful send fires its own mark-read beacon.
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();

    // The bar is consumed by the send, exactly like the draft.
    expect(el.querySelector('.replying')).toBeNull();
  });

  it('cancels a reply without touching the draft', () => {
    const { fixture, el } = create(false);
    const box = el.querySelector<HTMLTextAreaElement>('#thread-draft')!;
    box.value = 'half a thought';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    openReply(fixture, el);
    el.querySelector<HTMLButtonElement>('.replying-cancel')!.click();
    fixture.detectChanges();

    expect(el.querySelector('.replying')).toBeNull();
    // Cancelling a reply must never eat what the user typed.
    expect(box.value).toBe('half a thought');
  });

  it('shows a deleted parent as a deleted quote rather than dropping the quote', () => {
    const { fixture, el } = create();
    const quote = quoteBlocks(el)[0];
    expect(quote.textContent).toContain('Replying to');

    // The parent goes away over the hub.
    deletions.next({ messageId: 'm1' });
    fixture.detectChanges();

    const after = quoteBlocks(el);
    // The quote SURVIVES — a reply whose quote silently disappeared would read as the first
    // word in the thread — and says the parent is gone without inventing content for it.
    expect(after).toHaveLength(1);
    expect(after[0].textContent).toContain('Deleted message');
    expect(after[0].textContent).not.toContain('was it?');
    expect(after[0].classList).toContain('deleted');
  });

  it('closes the reply bar when its target is deleted underneath it', () => {
    const { fixture, el } = create(false);
    openReply(fixture, el);
    expect(el.querySelector('.replying')).not.toBeNull();

    deletions.next({ messageId: 'm1' });
    fixture.detectChanges();

    // Otherwise the next send would carry a target the server now refuses.
    expect(el.querySelector('.replying')).toBeNull();
  });

  it('re-quotes a reply when the message it answers is edited', () => {
    const { fixture, el } = create();

    edits.next({ ...message('m1', 'bob', 'was it, though') });
    fixture.detectChanges();

    const quote = quoteBlocks(el)[0];
    expect(quote.textContent).toContain('was it, though');
    expect(quote.textContent).not.toContain('was it?');
  });

  it('refreshes the reply bar when the message it answers is edited', () => {
    const { fixture, el } = create(false);
    openReply(fixture, el);
    expect(el.querySelector('.replying')?.textContent).toContain('was it?');

    // Replying to the old wording would quote it verbatim in the sent message.
    edits.next({ ...message('m1', 'bob', 'was it, though') });
    fixture.detectChanges();

    expect(el.querySelector('.replying')?.textContent).toContain('was it, though');
  });

  it('shows an attachment-only parent as an attachment, not as deleted', () => {
    const fixture = TestBed.createComponent(Thread);
    fixture.detectChanges();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [
        message('m3', 'me', 'nice', null, [], 0, {
          id: 'm1',
          senderId: 'bob',
          // No text and NOT deleted — a different state from "gone", and it must not collapse
          // into it or the thread would accuse a conversation the reader can see of being gone.
          excerpt: null,
          wasDeleted: false,
        }),
        message('m1', 'bob', 'look'),
      ],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const quote = quoteBlocks(el)[0];
    expect(quote.textContent).toContain('Attachment');
    expect(quote.textContent).toContain('Replying to');
    expect(quote.classList).not.toContain('deleted');
  });
});

describe('Thread refused image', () => {
  let http: HttpTestingController;
  const pushes = new Subject<MessageResponse>();
  const edits = new Subject<MessageResponse>();
  const deletions = new Subject<{ messageId: string }>();
  const reactionPushes = new Subject<MessageReactionChangedPayload>();

  beforeEach(async () => {
    // The Ready poll is timer-driven; without this the status request never appears.
    vi.useFakeTimers();
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
        messageReaction$: reactionPushes.asObservable(),
        resync$: new Subject().asObservable(),
      },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  /** Loads a thread and puts a finished upload in the composer, ready to send. */
  function create() {
    const fixture = TestBed.createComponent(Thread);
    fixture.detectChanges();
    expectApi(http, '/conversations/c1/messages').flush({
      messages: [message('m1', 'bob', 'hi')],
      nextCursor: null,
    });
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    // A settled attachment, reached the same way a real one is: an upload that comes back ready.
    const input = el.querySelector<HTMLInputElement>('input[type=file]')!;
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expectApi(http, '/media').flush({ id: 'med1', status: 'Processing' });
    // The Ready poll is timer-driven, matching the pattern the other attachment tests use.
    vi.advanceTimersByTime(0);
    expectApi(http, '/media/med1/status').flush({ id: 'med1', status: 'Ready' });
    fixture.detectChanges();

    return { fixture, el };
  }

  /** Types text and sends, returning the POST so the caller can decide the outcome. */
  function sendWithText(fixture: { detectChanges(): void }, el: HTMLElement, text: string) {
    const box = el.querySelector<HTMLTextAreaElement>('#thread-draft')!;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    // The caller flushes what this returns, which is also why it is expectOne: both expectOne
    // and match consume, so the request must be handed back rather than looked up twice.
    return http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/messages'));
  }

  it('ExplainsTheRefusalInsteadOfSayingTryAgain', () => {
    const { fixture, el } = create();
    sendWithText(fixture, el, 'look at this').flush(
      // A bare array, which is the shape ErrorOr serialises for 409 — the normalizer reads
      // that, not an object with an 'errors' key.
      [{ code: 'Media.RefusedByRecipient', description: 'nope', type: 'Conflict' }],
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    const banner = el.querySelector('.send-error')!.textContent ?? '';
    // "Try again" is not advice here: the same image is refused identically, forever.
    expect(banner).toContain("can't be sent to this conversation");
    expect(banner).not.toContain('try again');
    expect(el.querySelector('.send-error')?.classList).toContain('refused');
  });

  it('KeepsTheTypedTextAndDropsTheImageTheServerAlreadyDeleted', () => {
    const { fixture, el } = create();
    sendWithText(fixture, el, 'look at this').flush(
      // A bare array, which is the shape ErrorOr serialises for 409 — the normalizer reads
      // that, not an object with an 'errors' key.
      [{ code: 'Media.RefusedByRecipient', description: 'nope', type: 'Conflict' }],
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    // The words are still the user's; only the picture went.
    expect(el.querySelector<HTMLTextAreaElement>('#thread-draft')!.value).toBe('look at this');
    // The attachment is gone from the composer — the server soft-deleted it while refusing, so
    // keeping it would leave a dead mediaId that fails as NotFound on the next attempt.
    expect(el.querySelector('.attachment')).toBeNull();
  });

  it('DoesNotDeleteTheMediaAgain_AfterARefusal', () => {
    const { fixture, el } = create();
    sendWithText(fixture, el, 'look at this').flush(
      // A bare array, which is the shape ErrorOr serialises for 409 — the normalizer reads
      // that, not an object with an 'errors' key.
      [{ code: 'Media.RefusedByRecipient', description: 'nope', type: 'Conflict' }],
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    // The server already deleted it; a second DELETE would be a guaranteed 404 against an id
    // the client has just stopped using.
    http.expectNone((r) => r.method === 'DELETE' && r.url.endsWith('/media/med1'));
  });

  it('LetsTheMessageGoThroughWithoutTheImage', () => {
    const { fixture, el } = create();
    sendWithText(fixture, el, 'look at this').flush(
      // A bare array, which is the shape ErrorOr serialises for 409 — the normalizer reads
      // that, not an object with an 'errors' key.
      [{ code: 'Media.RefusedByRecipient', description: 'nope', type: 'Conflict' }],
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    // The recovery the banner offers: send the words on their own.
    const retry = sendWithText(fixture, el, 'look at this');
    expect(retry.request.body).toEqual({
      content: 'look at this',
      mediaId: null,
      replyToMessageId: null,
    });
    retry.flush(message('m2', 'me', 'look at this'));
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();

    expect(el.querySelector('.send-error')).toBeNull();
  });

  it('KeepsTheOrdinaryCopyForAnUnrelatedFailure', () => {
    const { fixture, el } = create();
    sendWithText(fixture, el, 'look at this').flush(
      {},
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    // Matched on the error CODE, not the 409 status — 409 is also the edit-conflict path, and
    // conflating them would show this recovery for a completely different problem.
    expect(el.querySelector('.send-error')?.textContent).toContain("Couldn't send");
    expect(el.querySelector('.send-error')?.classList).not.toContain('refused');
  });

  it('ClearsTheRefusalBannerOnTheNextAttempt', () => {
    const { fixture, el } = create();
    sendWithText(fixture, el, 'first').flush(
      // A bare array, which is the shape ErrorOr serialises for 409 — the normalizer reads
      // that, not an object with an 'errors' key.
      [{ code: 'Media.RefusedByRecipient', description: 'nope', type: 'Conflict' }],
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();
    expect(el.querySelector('.send-error')).not.toBeNull();

    const retry = sendWithText(fixture, el, 'second');
    fixture.detectChanges();

    // No stale refusal left hanging over an attempt that may well succeed.
    expect(el.querySelector('.send-error')).toBeNull();
    retry.flush(message('m2', 'me', 'second'));
    expectApi(http, '/conversations/c1/read').flush(null);
    fixture.detectChanges();
  });
});
