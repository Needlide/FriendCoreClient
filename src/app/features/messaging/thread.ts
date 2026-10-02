import { Component, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models/api-error';
import { MessageResponse } from '../../core/models/realtime.models';
import { AuthError } from '../auth/ui/auth-error';
import { MessagingService } from './messaging.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { LinkifiedText } from '../shared/linkified-text';

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
 */
@Component({
  selector: 'fc-thread',
  imports: [AuthError, LinkifiedText],
  templateUrl: './thread.html',
  styleUrl: './thread.scss',
})
export class Thread implements OnDestroy {
  private readonly messaging = inject(MessagingService);
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
  private conversationId = '';
  private subscription: Subscription;

  constructor() {
    this.subscription = this.realtime.message$.subscribe((m) => this.onPush(m));
    this.subscription.add(
      this.realtime.resync$.subscribe((hub) => {
        if (hub === 'messaging' && this.conversationId) this.reloadLatest();
      }),
    );
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.conversationId = id;
        this.reset();
        this.loadLatest();
      }
    });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
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
    this.messaging.messages(this.conversationId, cursor).subscribe({
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
    if (!content || this.sending()) return;
    this.sending.set(true);
    this.sendError.set(false);
    this.messaging.send(this.conversationId, content).subscribe({
      next: (message) => {
        // The POST response is the source of truth for our own message — merge by id
        // so a racing push of the same message can never duplicate it.
        this.merge([message]);
        this.draft.set('');
        this.sending.set(false);
        this.markRead();
      },
      error: () => {
        this.sending.set(false);
        this.sendError.set(true);
      },
    });
  }

  protected retry(): void {
    this.error.set(null);
    this.notFound.set(false);
    this.loadLatest();
  }

  private reset(): void {
    this.messages.set([]);
    this.nextCursor.set(undefined);
    this.error.set(null);
    this.notFound.set(false);
    this.sendError.set(false);
  }

  private loadLatest(): void {
    this.loading.set(true);
    this.messaging.messages(this.conversationId).subscribe({
      next: (res) => {
        this.messages.set([...res.messages].reverse());
        this.nextCursor.set(res.nextCursor);
        this.loading.set(false);
        this.markRead();
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (err instanceof ApiError && err.status === 404) this.notFound.set(true);
        else this.error.set(err instanceof ApiError ? err : null);
      },
    });
  }

  /** Refetch the latest page and merge — the reconcile path for pushes/reconnects. */
  private reloadLatest(): void {
    this.messaging.messages(this.conversationId).subscribe({
      next: (res) => {
        this.merge(res.messages);
        this.nextCursor.set(res.nextCursor);
        this.markRead();
      },
      error: () => undefined,
    });
  }

  private onPush(m: MessageResponse): void {
    if (m.conversationId !== this.conversationId) return;
    this.merge([m]);
    this.markRead();
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

  private markRead(): void {
    // Fire-and-forget: read state is derived server-side; a failed beacon just means
    // the count clears on the next successful one.
    this.messaging.markRead(this.conversationId).subscribe();
  }

  protected goBack(): void {
    void this.router.navigate(['/messages']);
  }
}
