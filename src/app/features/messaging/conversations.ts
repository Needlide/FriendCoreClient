import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { RelativeTimePipe } from '../feed/relative-time.pipe';
import { ApiError } from '../../core/models/api-error';
import { Conversation } from '../../core/models/messaging.models';
import { AuthError } from '../auth/ui/auth-error';
import { MessagingService } from './messaging.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { Subscription } from 'rxjs';
import { OnDestroy } from '@angular/core';

/**
 * Conversation list (`/messages`, UI-Plan §1). Refetches on every messaging push or
 * reconnect (unread counts live server-side via LastReadAt — the list is cheap).
 * The support entry sits in the empty state AND as a permanent row below: help
 * should be findable with zero messages and with a hundred.
 */
@Component({
  selector: 'fc-conversations',
  imports: [RouterLink, RelativeTimePipe, AuthError],
  templateUrl: './conversations.html',
  styleUrl: './conversations.scss',
})
export class Conversations implements OnDestroy {
  private readonly messaging = inject(MessagingService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly openingSupport = signal(false);
  protected readonly supportError = signal<ApiError | null>(null);
  private subscription: Subscription;

  constructor() {
    this.subscription = this.realtime.message$.subscribe(() => this.reload());
    this.subscription.add(
      this.realtime.resync$.subscribe((hub) => {
        if (hub === 'messaging') this.reload();
      }),
    );
    this.reload();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  protected retry(): void {
    this.error.set(null);
    this.reload();
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

  private reload(): void {
    this.loading.set(true);
    this.messaging.conversations().subscribe({
      next: (res) => {
        this.conversations.set(res.conversations);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }
}
