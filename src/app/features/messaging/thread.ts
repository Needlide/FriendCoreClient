import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  OnDestroy,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  EMPTY,
  Observable,
  Subject,
  Subscription,
  catchError,
  filter,
  map,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models/api-error';
import {
  MessageReactionChangedPayload,
  MessageReferenceResponse,
  MessageResponse,
  ReactionResponse,
} from '../../core/models/realtime.models';
import { MediaService } from '../feed/media.service';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_MEDIA_BYTES,
  MediaUploadResponse,
  UploadProgress,
} from '../../core/models/posts.models';
import { MediaViewer } from '../feed/media-viewer';
import { RelativeTimePipe } from '../feed/relative-time.pipe';
import { AuthError } from '../auth/ui/auth-error';
import { ReportDialog } from '../safety/report-dialog';
import { ReportTarget } from '../../core/models/settings.models';
import { MessagingService } from './messaging.service';
import { UnreadService } from '../../core/services/unread.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { PreferencesService } from '../../core/preferences/preferences.service';
import { LinkifiedText } from '../shared/linkified-text';
import { SafetyDeclaration } from '../shared/safety-declaration';

/**
 * The emoji offered by the reaction picker. Mirrors the server's `ReactionEmoji` allow-list,
 * which is the real gate — an emoji missing here can never be typed in, and one the server
 * drops returns a 400. Kept in the server's declared order because that order is the
 * tiebreak for chips that hold an equal count, so matching it keeps the row from reshuffling
 * between a push and the refetch that follows a reconnect.
 */
/**
 * Server error code for "the recipient declined this image". Matched on the code rather than the
 * 409 status, because 409 is also used by the edit-conflict path and conflating them would show
 * the wrong recovery for a completely different problem.
 */
const REFUSED_MEDIA_CODE = 'Media.RefusedByRecipient';

const REACTION_EMOJI = [
  '\u{1F44D}',
  '\u2764\uFE0F',
  '\u{1F602}',
  '\u{1F622}',
  '\u{1F62E}',
  '\u{1F64F}',
  '\u{1F389}',
] as const;

// Explicit type args: `as const` narrows the array's element type to the literal emoji
// union, which would otherwise become the Map's key type and reject every lookup by
// plain `string` (as the server and the DTO hand us).
const REACTION_PICKER_ORDER = new Map<string, number>(
  REACTION_EMOJI.map((emoji, index): [string, number] => [emoji, index]),
);

/** Most-reacted first, then picker order — the same ordering the server applies. */
function sortReactions(chips: ReactionResponse[]): ReactionResponse[] {
  const last = REACTION_EMOJI.length;
  return [...chips].sort(
    (a, b) =>
      b.count - a.count ||
      (REACTION_PICKER_ORDER.get(a.emoji) ?? last) - (REACTION_PICKER_ORDER.get(b.emoji) ?? last),
  );
}

/**
 * What the chips should look like right now, computed locally so a tap moves instantly.
 * Mirrors the server's toggle exactly: holding it takes it back, a count reaching zero drops
 * the chip entirely rather than leaving a 0 behind.
 */
function applyLocalToggle(chips: ReactionResponse[], emoji: string): ReactionResponse[] {
  const existing = chips.find((chip) => chip.emoji === emoji);

  if (!existing) {
    return sortReactions([...chips, { emoji, count: 1, reacted: true }]);
  }

  if (existing.reacted) {
    const remaining = existing.count - 1;
    return sortReactions(
      remaining > 0
        ? chips.map((chip) =>
            chip.emoji === emoji ? { ...chip, count: remaining, reacted: false } : chip,
          )
        : chips.filter((chip) => chip.emoji !== emoji),
    );
  }

  return sortReactions(
    chips.map((chip) =>
      chip.emoji === emoji ? { ...chip, count: chip.count + 1, reacted: true } : chip,
    ),
  );
}

/** Same lifecycle the post composer drives, trimmed to one attachment. */
type AttachmentState =
  | { kind: 'uploading'; percent: number; preview: string }
  | { kind: 'processing'; preview: string }
  | { kind: 'ready'; mediaId: string; preview: string }
  | { kind: 'failed'; preview: string; message: string };

/**
 * One conversation thread (`/messages/:id`, UI-Plan §1). The API returns messages
 * newest-first; the UI shows oldest-at-top with the composer pinned at the bottom,
 * so each page is reversed on arrival. "Load older" prepends the next cursor page.
 *
 * Read + realtime rules:
 *  - markRead fires after every successful load (opening the thread reads it) and
 *    whenever a live push arrives for THIS conversation while it's open.
 *  - a push for this conversation triggers a lightweight reconcile: refetch the
 *    latest page and merge by id (the sender's own messages already exist from the
 *    POST response — only the recipient appends via push, and merge dedupes).
 *  - pushes for OTHER conversations are ignored here (the list's unread counts
 *    update via its own subscription).
 *  - any reconnect refetches the latest page (missed pushes during the gap).
 *  - send failures keep the text in the box — never eat a typed message.
 *
 * Attachments reuse the post media pipeline wholesale (POST /media → poll → Ready),
 * so an image is uploaded once and usable in either place, and it carries the same
 * flashing/intense-motion flags MediaViewer already honours. One per message, matching
 * the server's single-slot contract.
 *
 * Two subtleties the code depends on:
 *  - the param subscription runs through switchMap and is bound with
 *    takeUntilDestroyed. Switching conversations reuses this instance, so without
 *    switchMap a slow reply for the previous conversation would render under the
 *    new one. (paramMap is a never-completed BehaviorSubject, so a plain
 *    subscribe was never torn down by ngOnDestroy — it outlived the component.)
 *  - the in-flight load carries the id it was started for. Reading the mutable
 *    `conversationId` field inside a callback would attribute an old response to
 *    whichever conversation happens to be open when it lands.
 */
@Component({
  selector: 'fc-thread',
  imports: [
    AuthError,
    MediaViewer,
    LinkifiedText,
    RelativeTimePipe,
    DatePipe,
    ReportDialog,
    SafetyDeclaration,
  ],
  templateUrl: './thread.html',
  styleUrl: './thread.scss',
})
export class Thread implements OnDestroy {
  private readonly messaging = inject(MessagingService);
  private readonly unread = inject(UnreadService);
  private readonly media = inject(MediaService);
  private readonly realtime = inject(RealtimeService);
  private readonly prefs = inject(PreferencesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly notFound = signal(false);
  protected readonly messages = signal<MessageResponse[]>([]);
  protected readonly nextCursor = signal<string | null | undefined>(undefined);

  /**
   * Cursor for messages NEWER than the oldest one on screen — non-null only while the thread is
   * parked mid-conversation by a jump.
   *
   * <p>The ordinary feed is one-way (walk backwards from the newest message), so it has no such
   * cursor. Jumping to an old message puts the thread in the middle of a conversation, where
   * "back to the start" is as natural a move as "back to the end".
   */
  private readonly newerCursor = signal<string | null | undefined>(undefined);

  /** True while the thread is showing a window rather than the live end of the conversation. */
  protected readonly parkedMidConversation = signal(false);

  /** The message the reader jumped to, for highlighting and for "you are here" copy. */
  protected readonly jumpedToId = signal<string | null>(null);

  protected readonly jumpingTo = signal(false);
  protected readonly jumpError = signal(false);
  protected readonly loadingOlder = signal(false);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly sendError = signal(false);
  /**
   * The recipient has declined this exact image before, so the server refused the send.
   *
   *   Its own signal rather than a branch on sendError: the recovery is different, and the copy
   *   has to be different. "Couldn't send, try again" is actively misleading here — retrying the
   *   same image unchanged fails identically, forever.
   */
  protected readonly sendRefused = signal(false);
  protected readonly attachment = signal<AttachmentState | null>(null);

  /**
   * Creator safety declaration for an attached image (API §7.4 layer 1) — the DM counterpart
   * of the post composer's checkbox. DMs gained image sending recently and this hardcoded both
   * flags to false, so a flashing GIF sent privately was the one surface where harmful media
   * could not be declared at all. Same shared control as the composer, so the two cannot drift.
   *
   * Reset on conversation switch and after a successful send, for the same reason the attachment
   * is: the declaration belongs to the pending upload, not to the thread.
   */
  protected readonly warnSafety = signal(false);

  // --- per-message actions (edit / delete / report) -------------------------------
  // One message is being edited inline; its draft lives here rather than in the composer,
  // so the composer draft is never at risk from a half-finished edit.
  protected readonly editingId = signal<string | null>(null);
  protected readonly editDraft = signal('');
  protected readonly savingEdit = signal(false);
  /** True when the last edit failed — the bubble stays open with the text intact. */
  protected readonly editFailed = signal(false);
  /**
   * True when the last edit was refused as stale: this account saved a different wording of
   * this same message from another device. Needs its own copy and its own recovery, because
   * pressing Save again unchanged would conflict again — the version held here is behind.
   */
  protected readonly editConflict = signal(false);
  /** Message awaiting delete confirmation; null when no confirm panel is open. */
  protected readonly confirmingDeleteId = signal<string | null>(null);
  protected readonly hidingId = signal<string | null>(null);

  // --- search ---------------------------------------------------------------------------

  protected readonly searchTerm = signal('');
  protected readonly searchResults = signal<MessageResponse[] | null>(null);
  protected readonly searching = signal(false);
  protected readonly searchError = signal(false);

  /**
   * Debounce handle for the search box. Held as a plain field rather than a signal because it is
   * not state anything renders — it is a timer to cancel.
   */
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Guards against an older, slower response overwriting a newer one. */
  private searchSequence = 0;

  /**
   * Messages this user has hidden in this thread, kept even after they leave `messages`.
   *
   * <p>The server filters them out of every fetch, so the list alone cannot say "hidden" — it can
   * only say "absent". That is not enough, because a hidden message is absent in exactly the
   * situations where something would put it back: a `MessageReceived` push replaying it, or a
   * reconcile page that still contains it. Without this set, hiding would appear to work and then
   * silently undo itself the next time anything arrived.
   */
  private readonly hiddenIds = signal<ReadonlySet<string>>(new Set());
  protected readonly deletingId = signal<string | null>(null);
  /**
   * What the report dialog is filed against. A full target rather than an id because one
   * bubble can offer two distinct reports — the message, and the image inside it — and they
   * are not interchangeable: removing a message drops the bubble but leaves the media row
   * alive, so an image reported only via its message could still be re-sent.
   *
   * Starts empty because ReportDialog's `target` is a required input and the dialog is
   * rendered permanently; openReport*() always sets it before the dialog can be opened.
   */
  protected readonly reportingTarget = signal<ReportTarget>({
    kind: 'message',
    conversationId: '',
    id: '',
  });
  /** Inline banner copy for an action that failed; cleared by the next attempt. */
  protected readonly actionError = signal<string | null>(null);

  // --- replies ---------------------------------------------------------------------
  /**
   * The message the next send will reply to: its id plus the text for the bar.
   *
   * Deliberately NOT the server's `replyTo` reference and not a whole message. The bar describes
   * the message being answered, so replying to a reply must show THAT message and not the one it
   * quoted — otherwise "reply" silently skips a level. And the stored excerpt is the server's to
   * decide at send time; the bar only needs something to show, which is why this is a local
   * shape rather than a pretend `MessageReferenceResponse`.
   */
  protected readonly replyingTo = signal<{ id: string; label: string } | null>(null);

  // --- replies -------------------------------------------------------------------------

  /**
   * Enters reply mode against a message. Self-replies are allowed: threading a thought by hand is
   * ordinary, and the server does not distinguish.
   */
  protected startReply(m: MessageResponse): void {
    this.replyingTo.set({ id: m.id, label: m.content ?? 'Attachment' });
    this.confirmingDeleteId.set(null);
    this.actionError.set(null);
  }

  /** The bar's text for a message, matching how the quote block labels an attachment. */
  private previewLabel(m: MessageResponse): string {
    return m.content ?? 'Attachment';
  }

  protected cancelReply(): void {
    this.replyingTo.set(null);
  }

  /** Closes the reply bar if the message it was opened against is deleted underneath it. */
  private clearReplyIfTargetDeleted(messageId: string): void {
    if (this.replyingTo()?.id === messageId) this.replyingTo.set(null);
  }

  // --- reactions ---------------------------------------------------------------------
  /** The emoji the picker offers, in the server's order. */
  protected readonly reactionEmoji = REACTION_EMOJI;
  /** Message whose picker is open; null when none is. At most one at a time. */
  protected readonly pickerForId = signal<string | null>(null);
  /**
   * `messageId:emoji` keys of toggles still in flight. Guards against a double tap: the tap
   * already moved the chip optimistically, and without this a second tap would compute a
   * third state from the server's answer to the first.
   */
  protected readonly pendingReactions = signal<ReadonlySet<string>>(new Set());

  private conversationId = '';
  private subscription: Subscription;
  private readonly destroyRef = inject(DestroyRef);

  /** Cancels an in-flight upload/poll when a new file is picked or the draft discarded. */
  private readonly superseded = new Subject<void>();

  constructor() {
    this.subscription = this.realtime.message$.subscribe((m) => this.onPush(m));
    this.subscription.add(this.realtime.messageEdited$.subscribe((m) => this.onEdited(m)));
    this.subscription.add(
      this.realtime.messageDeleted$.subscribe((p) => this.onDeleted(p.messageId)),
    );
    this.subscription.add(
      this.realtime.messageReaction$.subscribe((p) => this.onReactionChanged(p)),
    );
    this.subscription.add(
      this.realtime.resync$.subscribe((hub) => {
        if (hub === 'messaging' && this.conversationId) this.reloadLatest(this.conversationId);
      }),
    );
    // switchMap (NOT mergeMap): switching from conversation A to B reuses this
    // instance, so B's request must cancel A's — otherwise a slow A response
    // lands afterwards and paints A's messages (and A's markRead) inside B.
    this.route.paramMap
      .pipe(
        map((params) => params.get('id')),
        filter((id): id is string => !!id),
        switchMap((id) => {
          this.conversationId = id;
          this.reset();
          return this.loadLatest(id);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    this.superseded.complete();
  }

  protected get exhausted(): boolean {
    return this.nextCursor() === null;
  }

  /**
   * True when this message starts a new calendar day relative to the one before it.
   *
   * <p>Compared against the message immediately above rather than "today", so a divider does not
   * reappear every time the page re-renders and so the first message in the thread always gets one.
   */
  protected startsDay(m: MessageResponse): boolean {
    const current = new Date(m.createdAt);
    const index = this.messages().findIndex((candidate) => candidate.id === m.id);
    if (index <= 0) return true;

    const previous = new Date(this.messages()[index - 1].createdAt);

    // Local calendar day, not a 24-hour window: 23:59 and 00:01 on either side of midnight are
    // different days, and a thread read in the morning should not show yesterday's divider twice.
    return (
      current.getFullYear() !== previous.getFullYear() ||
      current.getMonth() !== previous.getMonth() ||
      current.getDate() !== previous.getDate()
    );
  }

  /**
   * "Today" / "Yesterday" where that is true, a weekday within the last week, otherwise a date.
   *
   * <p>Resolved from the viewer's clock rather than the server's, and deliberately: "Today" means
   * today for the person reading it. If the two disagreed the divider would name the wrong day and
   * there would be no way for the reader to tell.
   */
  protected dayLabel(m: MessageResponse): string {
    const date = new Date(m.createdAt);
    const now = new Date();

    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });

    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString(
      undefined,
      sameYear
        ? { day: 'numeric', month: 'long' }
        : { day: 'numeric', month: 'long', year: 'numeric' },
    );
  }

  // --- scrolling -----------------------------------------------------------------------

  private readonly messageList = viewChild<ElementRef<HTMLUListElement>>('messageList');

  /**
   * Messages that arrived while the reader was scrolled away from the bottom. Zero means the
   * thread is showing the newest message, which is the only state where "new messages" is false.
   */
  protected readonly unseenBelow = signal(0);

  /** How close to the bottom still counts as "at the bottom", in CSS pixels. */
  private static readonly BottomSlackPx = 120;

  private lastMessageCount = 0;
  private lastFirstId: string | null = null;
  private lastLastId: string | null = null;
  private lastScrollHeight = 0;
  private lastJumpedId: string | null = null;

  private readonly scrollWatcher = effect(() => {
    // Depends on the list, so any change to it re-runs this after render.
    const messages = this.messages();
    const element = this.messageList()?.nativeElement;
    if (element) this.applyScroll(element, messages);
  });

  /**
   * Keeps the viewport somewhere sensible after the list changes.
   *
   * <p>Three cases, and getting them wrong is the classic chat bug where the screen jumps under
   * your thumb:
   *
   * <ul>
   *     <li>First load — go to the bottom. A conversation should open at its newest message.</li>
   *     <li>Older messages prepended — hold the anchor. The scroll position is restored by the
   *     height the list grew by, so the message you were reading stays under your eyes instead of
   *     being pushed off the bottom by the page above it.</li>
   *     <li>A new message arrives — stick to the bottom only if you were already there. Otherwise
   *     leave the view alone and count it, because yanking someone out of what they were reading to
   *     show them a message they have not chosen to read yet is worse than making them scroll.</li>
   * </ul>
   */
  private applyScroll(element: HTMLUListElement, messages: MessageResponse[]): void {
    const firstId = messages[0]?.id ?? null;
    const lastId = messages[messages.length - 1]?.id ?? null;

    const isFirstLoad = this.lastMessageCount === 0 && messages.length > 0;
    const prepended = !isFirstLoad && firstId !== this.lastFirstId && lastId === this.lastLastId;
    const appended = !isFirstLoad && lastId !== this.lastLastId;

    this.lastMessageCount = messages.length;
    this.lastFirstId = firstId;
    this.lastLastId = lastId;

    if (isFirstLoad) {
      element.scrollTop = element.scrollHeight;
      this.lastScrollHeight = element.scrollHeight;
      untracked(() => this.unseenBelow.set(0));
      return;
    }

    // A jump replaces the whole list, so none of the below rules apply: neither "you were at the
    // bottom" nor "this is a new message" is true of it. Scrolling to the highlighted message is
    // the entire point of the action.
    if (
      untracked(this.jumpedToId) !== null &&
      !prepended &&
      this.jumpedToId() !== this.lastJumpedId
    ) {
      this.lastJumpedId = untracked(this.jumpedToId);
      this.lastScrollHeight = element.scrollHeight;
      // scrollIntoView is absent in jsdom, and an unguarded call there throws inside the scroll
      // effect, which takes every later test in the file down with it. Absent means "cannot
      // scroll", not "must not try".
      const target = element.querySelector('.bubble.jumped');
      if (target && typeof target.scrollIntoView === 'function')
        target.scrollIntoView({ block: 'center' });
      untracked(() => this.unseenBelow.set(0));
      return;
    }

    if (prepended) {
      // The anchor is the message that was at the top before. Restoring by height delta keeps that
      // exact message in place whatever was inserted above it.
      element.scrollTop += element.scrollHeight - this.lastScrollHeight;
      this.lastScrollHeight = element.scrollHeight;
      return;
    }

    if (appended) {
      this.lastScrollHeight = element.scrollHeight;
      if (this.isNearBottom(element)) {
        element.scrollTop = element.scrollHeight;
        untracked(() => this.unseenBelow.set(0));
      } else {
        untracked(() => this.unseenBelow.update((count) => count + 1));
      }
    }
  }

  private isNearBottom(element: HTMLElement): boolean {
    return element.scrollHeight - element.scrollTop - element.clientHeight < Thread.BottomSlackPx;
  }

  /** Scrolls to the newest message and clears the "unseen" count. */
  protected scrollToLatest(): void {
    const element = this.messageList()?.nativeElement;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    this.unseenBelow.set(0);
  }

  /**
   * Recomputed when the user scrolls, so the "new messages" affordance disappears as soon as they
   * go and read it rather than lingering until the next push.
   */
  protected onThreadScroll(): void {
    const element = this.messageList()?.nativeElement;
    if (element && this.isNearBottom(element) && this.unseenBelow() > 0) {
      this.unseenBelow.set(0);
    }
  }

  protected isMine(m: MessageResponse): boolean {
    return m.senderId === this.auth.session()?.userId;
  }

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /**
   * Send key for the composer, honouring the user's `sendMessageOnEnter` preference.
   *
   * Two modes, both of which every messenger trains one way or the other:
   *  - Enter-to-send (the default): Enter sends, Shift+Enter inserts a newline. Ctrl/Cmd+Enter
   *    also sends, because a user who reaches for it should not be stranded.
   *  - Modifier-to-send: Enter inserts a newline, Ctrl+Enter or Cmd+Enter sends.
   *
   * Cmd is accepted alongside Ctrl because on a Mac keyboard the physical key below the space
   * bar is Cmd, and a Mac user asking for this option is far likelier to press Cmd+Enter than
   * to hunt for a Ctrl that also triggers a system shortcut.
   *
   * Returns without preventing anything when the key is not the send key, which is what lets
   * the textarea keep its native newline and caret behaviour. preventDefault only ever runs on
   * the send path — otherwise the preference would cost the user the ability to press Enter at
   * all.
   */
  protected onComposerKeydown(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.key !== 'Enter') return;

    const modifier = keyboard.ctrlKey || keyboard.metaKey;
    const shouldSend = this.prefs.sendMessageOnEnter() ? !keyboard.shiftKey : modifier;

    if (!shouldSend) return;
    keyboard.preventDefault();
    this.send();
  }

  protected loadOlder(): void {
    const cursor = this.nextCursor();
    if (this.loadingOlder() || cursor === null || cursor === undefined) return;
    this.loadingOlder.set(true);
    // Same reasoning as send(): bind the id now, not when the response lands.
    const id = this.conversationId;
    this.messaging
      .messages(id, cursor)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          // Older history goes ABOVE: reverse to oldest-first, then prepend.
          const seen = new Set(this.messages().map((m) => m.id));
          const older = [...res.messages].reverse().filter((m) => !seen.has(m.id));
          this.messages.update((current) => [...older, ...current]);
          this.nextCursor.set(res.nextCursor);
          this.loadingOlder.set(false);
        },
        error: () => this.loadingOlder.set(false),
      });
  }

  protected send(): void {
    const content = this.draft().trim();
    const att = this.attachment();
    const mediaId = att?.kind === 'ready' ? att.mediaId : null;
    // The server rejects a message with neither text nor an attachment, so don't
    // spend a round trip finding that out.
    if ((!content && !mediaId) || this.sending()) return;
    this.sending.set(true);
    this.sendError.set(false);
    this.sendRefused.set(false);
    // Capture the id the send was started for: the user can switch conversations
    // before the POST returns, and the reply must not land in the new thread.
    const id = this.conversationId;
    // Captured now: the reply bar can be dismissed, or its target deleted, before the POST
    // returns — and the request must not silently change shape underneath.
    const replyToId = this.replyingTo()?.id ?? null;

    this.messaging
      .send(id, content || null, mediaId, replyToId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (message) => {
          // The POST response is the source of truth for our own message — merge by id
          // so a racing push of the same message can never duplicate it.
          this.merge([message]);
          this.draft.set('');
          // The upload is now owned by the server; revoking the preview would blank
          // the image we just rendered from that response, so drop the state only.
          this.superseded.next();
          this.attachment.set(null);
          this.warnSafety.set(false);
          this.sending.set(false);
          // The reply is consumed by the send, exactly as the draft is.
          this.replyingTo.set(null);
          this.markRead(id);
        },
        error: (err: unknown) => {
          // Keep the text: nothing was sent, so nothing the user typed is lost.
          this.sending.set(false);
          this.sendError.set(true);

          if (err instanceof ApiError && err.has(REFUSED_MEDIA_CODE)) {
            this.sendRefused.set(true);
            // The server deleted the upload along with refusing it. Keeping it would leave the
            // composer holding a dead mediaId, and the next attempt would fail on a NotFound
            // instead of on the real reason.
            this.discardAttachment();
          }
        },
      });
  }

  /** File picker for the single attachment slot. Fast client checks, then upload. */
  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file after remove/failure
    if (!file || this.attachmentBusy()) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      this.attachment.set({
        kind: 'failed',
        preview: '',
        message: 'Only JPEG, PNG, WebP, or GIF images.',
      });
      return;
    }
    if (file.size > MAX_MEDIA_BYTES) {
      this.attachment.set({ kind: 'failed', preview: '', message: 'That file is over 20 MB.' });
      return;
    }

    if (this.attachment()) this.removeAttachment();

    const preview = URL.createObjectURL(file);
    this.attachment.set({ kind: 'uploading', percent: 0, preview });
    this.superseded.next();
    this.media
      // The declaration sets both fields: the sender can say "one of these might apply", not
      // which. Over-flagging is the safe direction (see SafetyDeclaration).
      .upload(file, {
        hasFlashingWarning: this.warnSafety(),
        hasIntenseMotionWarning: this.warnSafety(),
      })
      .pipe(takeUntil(this.superseded), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event: UploadProgress | MediaUploadResponse) => {
          if ('percent' in event) {
            this.attachment.set({ kind: 'uploading', percent: event.percent, preview });
          } else {
            this.pollUntilReady(event, preview);
          }
        },
        error: () => this.failAttachment(preview, 'Upload failed. Try again.'),
      });
  }

  private pollUntilReady(uploaded: MediaUploadResponse, preview: string): void {
    this.attachment.set({ kind: 'processing', preview });
    this.media
      .waitUntilReady(uploaded.id)
      .pipe(takeUntil(this.superseded), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          if (status.status === 'Ready') {
            this.attachment.set({ kind: 'ready', mediaId: uploaded.id, preview });
          } else {
            this.failAttachment(preview, 'The image could not be processed. Try another file.');
          }
        },
        error: () => this.failAttachment(preview, 'Timed out waiting for the image. Try again.'),
      });
  }

  protected removeAttachment(): void {
    this.superseded.next();
    const att = this.attachment();
    if (att && 'preview' in att && att.preview) URL.revokeObjectURL(att.preview);
    // An upload that was never attached to a message is an orphan; the server has no
    // sweeper for it, so best-effort delete it here.
    if (att && att.kind === 'ready') {
      this.media
        .deleteMedia(att.mediaId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ error: () => undefined });
    }
    this.attachment.set(null);
  }

  /**
   *     Drops the attachment locally WITHOUT asking the server to delete it.
   * </remarks>
   *   <remarks>
   *     Separate from {@link removeAttachment} because that one deletes the upload — correct when
   *     the user changes their mind, wrong here, where the server has ALREADY soft-deleted the
   *     media it refused. Calling delete again would be a guaranteed 404 against an id the
   *     client is about to stop using anyway.
   *   </remarks>
   */
  protected discardAttachment(): void {
    const att = this.attachment();
    if (att && 'preview' in att && att.preview) URL.revokeObjectURL(att.preview);
    this.superseded.next();
    this.attachment.set(null);
  }

  private failAttachment(preview: string, message: string): void {
    URL.revokeObjectURL(preview);
    this.attachment.set({ kind: 'failed', preview: '', message });
  }

  private attachmentBusy(): boolean {
    const att = this.attachment();
    return att !== null && (att.kind === 'uploading' || att.kind === 'processing');
  }

  protected canSend(): boolean {
    const att = this.attachment();
    const ready = att !== null && att.kind === 'ready';
    return !this.sending() && !this.attachmentBusy() && (this.draft().trim().length > 0 || ready);
  }

  protected attachmentBusyState(): boolean {
    return this.attachmentBusy();
  }

  protected attachmentPercent(): number {
    const att = this.attachment();
    return att?.kind === 'uploading' ? att.percent : 0;
  }

  protected attachmentMessage(): string {
    const att = this.attachment();
    return att?.kind === 'failed' ? att.message : '';
  }

  protected retry(): void {
    this.error.set(null);
    this.notFound.set(false);
    this.loadLatest(this.conversationId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  private reset(): void {
    this.messages.set([]);
    this.nextCursor.set(undefined);
    this.error.set(null);
    this.notFound.set(false);
    this.sendError.set(false);
    // Per-message action state is per-conversation too: leaving a confirm panel or an open
    // editor behind would apply to the next thread's messages.
    this.editingId.set(null);
    this.editDraft.set('');
    this.editFailed.set(false);
    this.editConflict.set(false);
    this.confirmingDeleteId.set(null);
    this.deletingId.set(null);
    // The reply bar belongs to the message it was opened against, not to the conversation.
    this.replyingTo.set(null);
    // Cleared to a placeholder: the dialog is closed whenever this resets, and openReport*
    // always overwrites it before the dialog can be opened.
    this.reportingTarget.set({ kind: 'message', conversationId: '', id: '' });
    this.actionError.set(null);
    // Same reasoning as the editor and confirm panel: a picker left open belongs to the
    // previous thread's message.
    this.pickerForId.set(null);
    this.pendingReactions.set(new Set());
    // Same reason as the send banner: it describes one attempt in one conversation.
    this.sendRefused.set(false);
    // Per conversation: another thread's hidden ids would wrongly suppress messages here.
    this.hiddenIds.set(new Set());
    this.hidingId.set(null);
    // Search is per conversation too, and an in-flight request for the previous one would land
    // in this thread's results.
    this.clearSearch();
    // A parked window belongs to the conversation that was jumped in, and its cursors point into
    // that conversation's history.
    this.newerCursor.set(undefined);
    this.parkedMidConversation.set(false);
    this.jumpedToId.set(null);
    this.lastJumpedId = null;
    this.jumpingTo.set(false);
    this.jumpError.set(false);
    // The declaration belongs to a pending upload, not to the conversation.
    this.warnSafety.set(false);
    // Switching conversations abandons a pending upload: it belongs to the previous
    // thread's draft, and leaving it in the slot would attach it to the wrong message.
    if (this.attachment()) this.removeAttachment();
  }

  private loadLatest(id: string): Observable<unknown> {
    this.loading.set(true);
    return this.messaging.messages(id).pipe(
      tap((res) => {
        this.messages.set([...res.messages].reverse());
        this.nextCursor.set(res.nextCursor);
        this.loading.set(false);
        this.markRead(id);
      }),
      catchError((err: unknown) => {
        this.loading.set(false);
        if (err instanceof ApiError && err.status === 404) this.notFound.set(true);
        else this.error.set(err instanceof ApiError ? err : null);
        return EMPTY;
      }),
    );
  }

  /** Refetch the latest page and merge — the reconcile path for pushes/reconnects. */
  private reloadLatest(id: string): void {
    this.messaging
      .messages(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.merge(res.messages);
          this.nextCursor.set(res.nextCursor);
          this.markRead(id);
        },
        error: () => undefined,
      });
  }

  // --- edit ---------------------------------------------------------------------------

  /** Only the text is editable, and only on a message that has some. */
  protected canEdit(m: MessageResponse): boolean {
    return this.isMine(m) && m.content !== null;
  }

  protected startEdit(m: MessageResponse): void {
    this.confirmingDeleteId.set(null);
    this.actionError.set(null);
    this.editingId.set(m.id);
    this.editDraft.set(m.content ?? '');
    this.editFailed.set(false);
    this.editConflict.set(false);
  }

  protected onEditDraft(event: Event): void {
    this.editDraft.set((event.target as HTMLTextAreaElement).value);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editDraft.set('');
    this.editFailed.set(false);
    this.editConflict.set(false);
  }

  /**
   * Optimistic: the bubble shows the new wording immediately and rolls back on failure. The
   * server's response replaces it, so what survives is the trimmed text rather than the
   * draft. A failed edit keeps the editor open — closing it would discard the user's typing
   * for a problem they can fix and retry.
   */
  protected saveEdit(messageId: string, previous: MessageResponse): void {
    const content = this.editDraft().trim();
    if (!content || this.savingEdit()) return;

    const optimistic: MessageResponse = { ...previous, content };
    this.upsert(optimistic);
    this.savingEdit.set(true);
    this.editFailed.set(false);

    const conversationId = this.conversationId;
    this.messaging
      // The version this editor was opened against, which is `previous`'s — saying so
      // explicitly keeps the compare-and-set honest about what the user was looking at when
      // they typed, rather than whatever the bubble holds by the time we send.
      .editMessage(conversationId, messageId, content, previous.version)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.upsert(saved);
          this.cancelEdit();
          this.savingEdit.set(false);
        },
        error: (err: unknown) => {
          // Bubble back to truth either way: the server never took the wording, and leaving
          // the optimistic text on screen would show something that does not exist.
          this.upsert(previous);
          this.editFailed.set(true);
          this.savingEdit.set(false);

          // A conflict is the one failure that cannot be retried as-is — the version held
          // here is behind, so the next Save would conflict identically. Refetch, so the
          // bubble ends up holding the wording that actually won and the next attempt has a
          // current version to present. The draft stays in the editor throughout.
          if (err instanceof ApiError && err.status === 409) {
            this.editConflict.set(true);
            this.reconcileCurrent(conversationId);
          }
        },
      });
  }

  /**
   * Refetch the latest page and replace what it returns.
   *
   * Deliberately not {@link reloadLatest}'s merge: merge leaves an already-held message alone,
   * which is right for a push-triggered catch-up but useless here — after a conflict the
   * bubble has to end up holding the wording that beat it, and the client has to be holding a
   * current version or every retry conflicts again.
   */
  private reconcileCurrent(id: string): void {
    this.messaging
      .messages(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          for (const message of res.messages) this.upsert(message);
          this.nextCursor.set(res.nextCursor);
        },
        error: () => undefined,
      });
  }

  // --- delete -------------------------------------------------------------------------

  protected askDelete(messageId: string): void {
    this.editingId.set(null);
    this.actionError.set(null);
    this.confirmingDeleteId.set(messageId);
  }

  protected cancelDelete(): void {
    this.confirmingDeleteId.set(null);
  }

  /**
   * Removed from the list on success, not before. A delete is irreversible and the text is
   * gone server-side, so an optimistic removal that failed would leave the user believing
   * they had erased something they had not.
   */
  protected confirmDelete(messageId: string): void {
    if (this.deletingId()) return;
    this.deletingId.set(messageId);

    this.messaging
      .deleteMessage(this.conversationId, messageId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.messages.update((current) => current.filter((m) => m.id !== messageId));
          this.confirmingDeleteId.set(null);
          this.deletingId.set(null);
        },
        // Re-arm the confirm panel so the action stays retryable, and say why.
        error: () => {
          this.confirmingDeleteId.set(null);
          this.deletingId.set(null);
          this.actionError.set("Couldn't delete that message. Try again.");
        },
      });
  }

  /**
   * Hides a message from this user's view. Unlike delete, nothing is destroyed: the bubble
   * disappears for them, the sender still has their copy, and the server records a consent
   * refusal for any image involved.
   *
   * <p>Removed locally on success rather than before, for the same reason as delete — an
   * optimistic removal that failed would show a message as gone while the server still has it
   * exactly where it was.
   */
  protected hideMessage(m: MessageResponse): void {
    if (this.hidingId()) return;
    this.hidingId.set(m.id);
    this.actionError.set(null);

    this.messaging
      .hideMessage(this.conversationId, m.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.hiddenIds.update((current) => new Set(current).add(m.id));
          this.messages.update((current) => current.filter((existing) => existing.id !== m.id));
          // Same teardown as a delete: an open reply bar, editor or confirm panel pointed at a
          // message that is no longer on screen has nothing left to act on.
          this.clearReplyIfTargetDeleted(m.id);
          this.editingId.set(null);
          this.pickerForId.set(null);
          this.hidingId.set(null);
        },
        error: () => {
          this.hidingId.set(null);
          this.actionError.set("Couldn't hide that message. Try again.");
        },
      });
  }

  protected isHiding(m: MessageResponse): boolean {
    return this.hidingId() === m.id;
  }

  /**
   * Runs a search after the user stops typing.
   *
   * <p>Debounced rather than fired per keystroke: three letters is not a search, and a request per
   * character would put the server round trip inside the user's typing.
   */
  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);

    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }

    const term = value.trim();

    // Below the server's minimum, so there is nothing to ask. Cleared rather than left showing,
    // because "no results" and "not searched yet" are different things to say to someone.
    if (term.length < 2) {
      this.searchResults.set(null);
      this.searchError.set(false);
      this.searching.set(false);
      this.searchSequence++;
      return;
    }

    this.searching.set(true);
    this.searchTimer = setTimeout(() => this.runSearch(term), 250);
  }

  private runSearch(term: string): void {
    this.searchTimer = null;
    const sequence = ++this.searchSequence;

    this.messaging
      .searchMessages(this.conversationId, term)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (feed) => {
          // A response for a term the user has already typed past must not land.
          if (sequence !== this.searchSequence) return;
          this.searchResults.set(feed.messages);
          this.searchError.set(false);
          this.searching.set(false);
        },
        error: () => {
          if (sequence !== this.searchSequence) return;
          this.searchError.set(true);
          this.searchResults.set(null);
          this.searching.set(false);
        },
      });
  }

  /**
   * Opens a search result where it actually sits.
   *
   * <p>Replaces the thread with a window around the message and switches it into two-way paging.
   * The window arrives oldest-first (the server builds it outward from the target) so it is NOT
   * reversed, unlike the feed — getting that backwards would show the conversation in mirror
   * image, and it would still look plausible.
   */
  protected jumpToMessage(messageId: string): void {
    if (this.jumpingTo()) return;
    this.jumpingTo.set(true);
    this.jumpError.set(false);
    this.actionError.set(null);

    const id = this.conversationId;
    this.messaging
      .messagesAround(id, messageId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (window) => {
          this.messages.set(window.messages);
          this.nextCursor.set(window.olderCursor);
          this.newerCursor.set(window.newerCursor);
          this.parkedMidConversation.set(true);
          this.jumpedToId.set(messageId);
          // The search panel has done its job; leaving it up would hide the message it found.
          this.clearSearch();
          this.jumpingTo.set(false);
        },
        error: () => {
          this.jumpingTo.set(false);
          // The message can have been deleted between searching and clicking. Say so rather than
          // silently doing nothing.
          this.jumpError.set(true);
          this.clearSearch();
        },
      });
  }

  /** Leaves the parked window and returns to the live end of the conversation. */
  protected backToLatest(): void {
    this.jumpedToId.set(null);
    this.jumpError.set(false);
    this.newerCursor.set(undefined);
    this.parkedMidConversation.set(false);
    this.lastJumpedId = null;
    this.loadLatest(this.conversationId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  /**
   * Loads the next page forwards, for a thread parked mid-conversation.
   *
   * <p>Appended rather than prepended — the mirror of loadOlder — and deduplicated, because the
   * window's edge can overlap whatever came back.
   */
  protected loadNewer(): void {
    const cursor = this.newerCursor();
    if (this.loadingOlder() || cursor === null || cursor === undefined) return;
    this.loadingOlder.set(true);

    const id = this.conversationId;
    this.messaging
      .messages(id, cursor)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const seen = new Set(this.messages().map((m) => m.id));
          const added = [...res.messages].reverse().filter((m) => !seen.has(m.id));
          this.messages.update((current) => [...current, ...added]);
          this.newerCursor.set(res.nextCursor);
          this.loadingOlder.set(false);
        },
        error: () => this.loadingOlder.set(false),
      });
  }

  protected get hasNewer(): boolean {
    return this.newerCursor() !== null && this.newerCursor() !== undefined;
  }

  /** True once a search has actually run — so "no matches" is distinguishable from "not yet". */
  protected get hasSearched(): boolean {
    return this.searchResults() !== null;
  }

  protected clearSearch(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.searchSequence++;
    this.searchTerm.set('');
    this.searchResults.set(null);
    this.searchError.set(false);
    this.searching.set(false);
  }

  // --- reactions -----------------------------------------------------------------------

  /** At most one picker is open, and only one bubble's. */
  protected isPickerOpen(m: MessageResponse): boolean {
    return this.pickerForId() === m.id;
  }

  protected togglePicker(m: MessageResponse): void {
    this.actionError.set(null);
    this.pickerForId.set(this.pickerForId() === m.id ? null : m.id);
  }

  protected isReactionPending(messageId: string, emoji: string): boolean {
    return this.pendingReactions().has(`${messageId}:${emoji}`);
  }

  /**
   * Optimistic, like the edit: the chip moves on tap and the server's answer replaces it, so
   * what survives is the real count — including a concurrent tap from the other participant
   * that landed in between. A failure rolls the chip back and says why, rather than leaving
   * a chip the server has no record of.
   */
  protected toggleReaction(m: MessageResponse, emoji: string): void {
    const key = `${m.id}:${emoji}`;
    if (this.pendingReactions().has(key)) return;

    const before = [...(m.reactions ?? [])];
    this.upsert({ ...m, reactions: applyLocalToggle(before, emoji) });
    this.actionError.set(null);
    this.markPending(key, true);

    // Bind the id now: the user can switch conversations before the POST returns.
    const conversationId = this.conversationId;
    this.messaging
      .toggleReaction(conversationId, m.id, emoji)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.applyServerReaction(m.id, emoji, result);
          this.markPending(key, false);
        },
        error: () => {
          this.upsert({ ...m, reactions: before });
          this.markPending(key, false);
          this.actionError.set("Couldn't save that reaction. Try again.");
        },
      });
  }

  /**
   * A reaction pushed from the other participant, or from this user's second device. Applied
   * to the one chip it names rather than refetching a page to redraw a single emoji. A count
   * of 0 means the last holder released it: drop the chip, with no tombstone left behind.
   */
  private onReactionChanged(payload: MessageReactionChangedPayload): void {
    // Message ids are globally unique, so membership is the whole test — the same reasoning
    // the delete push uses. A reaction on a message in another conversation cannot match
    // anything here, and one on a page this thread has not loaded is not ours to draw.
    const target = this.messages().find((m) => m.id === payload.messageId);
    if (!target) return;
    this.applyServerReaction(payload.messageId, payload.emoji, {
      emoji: payload.emoji,
      count: payload.count,
      reacted: payload.reacted,
    });
  }

  /** Writes the server's authoritative state for one emoji onto whichever message holds it. */
  private applyServerReaction(messageId: string, emoji: string, reaction: ReactionResponse): void {
    this.messages.update((current) =>
      current.map((m) => {
        if (m.id !== messageId) return m;
        const chips = m.reactions ?? [];
        const next =
          reaction.count <= 0
            ? chips.filter((chip) => chip.emoji !== emoji)
            : sortReactions([
                ...chips.filter((chip) => chip.emoji !== emoji),
                { emoji, count: reaction.count, reacted: reaction.reacted },
              ]);
        return { ...m, reactions: next };
      }),
    );
  }

  private markPending(key: string, pending: boolean): void {
    this.pendingReactions.update((current) => {
      const next = new Set(current);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  // --- report -------------------------------------------------------------------------

  protected openReport(messageId: string): void {
    this.reportingTarget.set({
      kind: 'message',
      conversationId: this.conversationId,
      id: messageId,
    });
  }

  /** Reports the image itself, not the message that carries it. */
  protected openReportImage(mediaId: string): void {
    this.reportingTarget.set({ kind: 'media', id: mediaId });
  }

  /** True when this bubble's image can be reported — never your own upload. */
  protected canReportImage(m: MessageResponse): boolean {
    return !this.isMine(m) && m.media !== null;
  }

  protected reportTarget(): ReportTarget {
    return this.reportingTarget();
  }

  private onPush(m: MessageResponse): void {
    // This thread is open and marks itself read, so the arriving message is never unread here.
    // Counting it would leave the nav badge showing a message the user is literally looking at.
    this.unread.clear(m.conversationId);
    if (m.conversationId !== this.conversationId) return;
    this.merge([m]);
    this.markRead(m.conversationId);
  }

  /**
   * An edit pushed from the other side (or from this user's second device). Applied in place
   * by id rather than by refetching: the payload is the full message, so a whole page reload
   * to change one word would be both slower and able to yank the view out from under a scroll.
   */
  private onEdited(m: MessageResponse): void {
    if (m.conversationId !== this.conversationId) return;
    this.upsert(m);

    // The edit lands on its own bubble, but if some OTHER loaded message replies to it, that
    // reply's quote is now stale. Without this the thread shows two versions of the same message
    // until the next reconcile — and a user replying to the old wording would quote it verbatim.
    this.messages.update((current) =>
      current.map((existing) =>
        existing.replyTo?.id === m.id && existing.id !== m.id
          ? { ...existing, replyTo: { ...existing.replyTo, excerpt: m.content, wasDeleted: false } }
          : existing,
      ),
    );
    // Same for the reply bar, which may be pointed at the message being edited.
    const bar = this.replyingTo();
    if (bar?.id === m.id) this.replyingTo.set({ ...bar, label: this.previewLabel(m) });
    // An open editor holds a stale draft of the very message that changed underneath it.
    if (this.editingId() === m.id) this.editDraft.set(m.content ?? '');
  }

  /** A delete pushed from the other side. There is no tombstone — the bubble just goes. */
  private onDeleted(messageId: string): void {
    // Whatever else is open against that message has to close first.
    this.clearReplyIfTargetDeleted(messageId);

    // Ids are globally unique, so membership is the whole test: a delete for another
    // conversation cannot match anything in this thread.
    if (!this.messages().some((m) => m.id === messageId)) return;

    // The message itself leaves no tombstone, but every loaded reply that QUOTED it stays — so
    // its quote has to change or the thread would keep showing text the server has scrubbed.
    // Each becomes `wasDeleted`, which is exactly what the server sends on a refetch, so the push
    // route and the reconcile route reach the same state and cannot disagree.
    this.messages.update((current) =>
      current
        .filter((m) => m.id !== messageId)
        .map((m) =>
          m.replyTo?.id === messageId
            ? { ...m, replyTo: { ...m.replyTo, excerpt: null, wasDeleted: true } }
            : m,
        ),
    );
    if (this.editingId() === messageId) this.cancelEdit();
    if (this.confirmingDeleteId() === messageId) this.confirmingDeleteId.set(null);
  }

  /** Replace a message we already hold with the server's current version. */
  private upsert(updated: MessageResponse): void {
    this.messages.update((current) => current.map((m) => (m.id === updated.id ? updated : m)));
  }

  /**
   * Merge newest-first arrivals into the oldest-first list, deduping by id.
   * Used ONLY for current-or-newer data (latest page, pushes, own sends) — older
   * history pages go through the prepend path in loadOlder, never here.
   */
  private merge(incomingNewestFirst: MessageResponse[]): void {
    const seen = new Set(this.messages().map((m) => m.id));
    const hidden = this.hiddenIds();
    // Hidden ids are excluded here, not merely absent from `seen`: a hidden message is by
    // definition not in the list, so dedupe alone reads it as genuinely new and re-adds it on the
    // next push that mentions it.
    const fresh = [...incomingNewestFirst]
      .reverse()
      .filter((m) => !seen.has(m.id) && !hidden.has(m.id));
    if (fresh.length === 0) return;
    this.messages.update((current) => {
      const ids = new Set(current.map((m) => m.id));
      return [...current, ...fresh.filter((m) => !ids.has(m.id))];
    });
  }

  private markRead(id: string): void {
    // Fire-and-forget: read state is derived server-side; a failed beacon just means
    // the count clears on the next successful one. takeUntilDestroyed so the request
    // is cancelled rather than resolving into a destroyed component.
    this.messaging
      .markRead(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => undefined });

    // The nav badge clears locally rather than waiting for a refetch: the reader is looking at
    // this conversation, so it is read, whatever the beacon's fate. A push that arrives first is
    // then counted against zero rather than resurrecting a conversation already on screen.
    this.unread.clear(this.conversationId);
  }

  protected goBack(): void {
    void this.router.navigate(['/messages']);
  }
}
