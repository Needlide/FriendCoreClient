import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { MessageResponse } from '../../core/models/realtime.models';
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
import { MessagingService } from './messaging.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { LinkifiedText } from '../shared/linkified-text';

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
  imports: [AuthError, MediaViewer, LinkifiedText, RelativeTimePipe],
  templateUrl: './thread.html',
  styleUrl: './thread.scss',
})
export class Thread implements OnDestroy {
  private readonly messaging = inject(MessagingService);
  private readonly media = inject(MediaService);
  private readonly realtime = inject(RealtimeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly notFound = signal(false);
  protected readonly messages = signal<MessageResponse[]>([]);
  protected readonly nextCursor = signal<string | null | undefined>(undefined);
  protected readonly loadingOlder = signal(false);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly sendError = signal(false);
  protected readonly attachment = signal<AttachmentState | null>(null);
  private conversationId = '';
  private subscription: Subscription;
  private readonly destroyRef = inject(DestroyRef);

  /** Cancels an in-flight upload/poll when a new file is picked or the draft discarded. */
  private readonly superseded = new Subject<void>();

  constructor() {
    this.subscription = this.realtime.message$.subscribe((m) => this.onPush(m));
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

  protected isMine(m: MessageResponse): boolean {
    return m.senderId === this.auth.session()?.userId;
  }

  protected onDraft(event: Event): void {
    this.draft.set((event.target as HTMLTextAreaElement).value);
  }

  /** Enter sends; Shift+Enter keeps its normal newline behavior. */
  protected onEnter(event: Event): void {
    const keyboard = event as KeyboardEvent;
    if (keyboard.shiftKey) return;
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
    // Capture the id the send was started for: the user can switch conversations
    // before the POST returns, and the reply must not land in the new thread.
    const id = this.conversationId;
    this.messaging
      .send(id, content || null, mediaId)
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
          this.sending.set(false);
          this.markRead(id);
        },
        error: () => {
          // Keep the text AND the attachment: nothing was sent, so nothing is lost.
          this.sending.set(false);
          this.sendError.set(true);
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
      .upload(file, { hasFlashingWarning: false, hasIntenseMotionWarning: false })
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

  private onPush(m: MessageResponse): void {
    if (m.conversationId !== this.conversationId) return;
    this.merge([m]);
    this.markRead(m.conversationId);
  }

  /**
   * Merge newest-first arrivals into the oldest-first list, deduping by id.
   * Used ONLY for current-or-newer data (latest page, pushes, own sends) — older
   * history pages go through the prepend path in loadOlder, never here.
   */
  private merge(incomingNewestFirst: MessageResponse[]): void {
    const seen = new Set(this.messages().map((m) => m.id));
    const fresh = [...incomingNewestFirst].reverse().filter((m) => !seen.has(m.id));
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
  }

  protected goBack(): void {
    void this.router.navigate(['/messages']);
  }
}
