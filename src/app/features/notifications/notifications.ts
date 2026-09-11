import { Component, OnDestroy, inject, signal } from '@angular/core';
import { RelativeTimePipe } from '../feed/relative-time.pipe';
import { ApiError } from '../../core/models/api-error';
import { NotificationItem } from '../../core/models/notifications.models';
import { AuthError } from '../auth/ui/auth-error';
import { NotificationsService } from './notifications.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { Subscription } from 'rxjs';

/**
 * Notifications page (`/notifications`, UI-Plan §1). Hydrated REST list — the push
 * payloads are ID-only, so every `notification$` event (and every reconnect via
 * `resync$`) refetches the list rather than rendering the skinny push.
 * "Mark all read" clears the bell in one call (server marks ALL).
 */
@Component({
  selector: 'fc-notifications',
  imports: [RelativeTimePipe, AuthError],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
})
export class Notifications implements OnDestroy {
  private readonly notifications = inject(NotificationsService);
  private readonly realtime = inject(RealtimeService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly items = signal<NotificationItem[]>([]);
  private subscription: Subscription;

  constructor() {
    this.subscription = this.realtime.notification$.subscribe(() => this.reload());
    this.subscription.add(
      this.realtime.resync$.subscribe((hub) => {
        if (hub === 'notifications') this.reload();
      }),
    );
    this.reload();
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  protected markAllRead(): void {
    this.notifications.markAllRead().subscribe({
      next: () => this.items.update((items) => items.map((n) => ({ ...n, isRead: true }))),
      error: () => undefined,
    });
  }

  protected describe(n: NotificationItem): string {
    const who = n.actor.displayName;
    switch (n.type) {
      case 'NewFollower':
        return `${who} started following you`;
      case 'NewLike':
        return `${who} liked your post`;
      case 'NewComment':
        return `${who} commented on your post`;
      case 'NewMessage':
        return `${who} sent you a message`;
      default:
        return `${who} interacted with you`;
    }
  }

  protected retry(): void {
    this.error.set(null);
    this.reload();
  }

  private reload(): void {
    this.loading.set(true);
    this.notifications.list().subscribe({
      next: (res) => {
        this.items.set(res.notifications);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }
}
