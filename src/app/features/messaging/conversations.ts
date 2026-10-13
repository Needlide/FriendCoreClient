import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, Subject, catchError, switchMap, tap } from 'rxjs';
import { RelativeTimePipe } from '../feed/relative-time.pipe';
import { ApiError } from '../../core/models/api-error';
import { Conversation } from '../../core/models/messaging.models';
import { AuthError } from '../auth/ui/auth-error';
import { MessagingService } from './messaging.service';
import { UnreadService } from '../../core/services/unread.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { Subscription } from 'rxjs';
import { OnDestroy } from '@angular/core';

/**
 * Conversation list (`/messages`, UI-Plan §1). Refetches on every messaging push or
 * reconnect (unread counts live server-side via LastReadAt — the list is cheap).
 * The support entry sits in the empty state AND as a permanent row below: help
 * should be findable with zero messages and with a hundred.
 *
 * The refetch is a switchMap over one trigger stream: a burst of pushes produces
 * overlapping GET /conversations, and without switchMap the one that happens to
 * finish last wins — a pre-push snapshot overwriting fresher unread counts.
 */
@Component({
  selector: 'fc-conversations',
  imports: [RouterLink, RelativeTimePipe, AuthError],
  templateUrl: './conversations.html',
  styleUrl: './conversations.scss',
})
export class Conversations implements OnDestroy {
  private readonly messaging = inject(MessagingService);
  private readonly unread = inject(UnreadService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly openingSupport = signal(false);
  protected readonly supportError = signal<ApiError | null>(null);
  private subscription: Subscription;

  /** Every reload trigger funnels through here so switchMap can cancel overlaps. */
  private readonly reload$ = new Subject<void>();

  constructor() {
    this.subscription = this.realtime.message$.subscribe(() => this.reload$.next());
    this.subscription.add(
      this.realtime.resync$.subscribe((hub) => {
        if (hub === 'messaging') this.reload$.next();
      }),
    );
    this.reload$
      .pipe(
        switchMap(() => this.fetch()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
    // Must come AFTER the switchMap subscription above: a plain Subject does not
    // replay, so a .next() before the subscriber exists is dropped entirely.
    this.reload$.next();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  protected retry(): void {
    this.error.set(null);
    this.reload$.next();
  }

  /** Find-or-create the support thread, then open it like any conversation. */
  protected openSupport(): void {
    if (this.openingSupport()) return;
    this.openingSupport.set(true);
    this.supportError.set(null);
    this.messaging.startSupport().subscribe({
      next: (conversation) => {
        this.openingSupport.set(false);
        void this.router.navigate(['/messages', conversation.id]);
      },
      error: (err: unknown) => {
        this.supportError.set(err instanceof ApiError ? err : null);
        this.openingSupport.set(false);
      },
    });
  }

  /**
   * The refetch itself. `error` is cleared HERE, not only in retry(): a failed
   * background refresh sets it, and without clearing on success the template's
   * `@else if (error())` branch keeps winning even after a good reload lands —
   * stranding the user on "Try again" with a populated list behind it.
   */
  private fetch(): Observable<unknown> {
    this.loading.set(true);
    this.error.set(null);
    return this.messaging.conversations().pipe(
      tap((res) => {
        this.conversations.set(res.conversations);
        // Hand the counts to the nav badge rather than letting it fetch its own: this response
        // already has every conversation's unread count, and a second request would only ever
        // disagree with this one.
        this.unread.setAll(res.conversations);
        this.loading.set(false);
      }),
      catchError((err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
        return EMPTY;
      }),
    );
  }
}
