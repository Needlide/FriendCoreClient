import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RelativeTimePipe } from '../feed/relative-time.pipe';
import { ApiError } from '../../core/models/api-error';
import { NOTIFICATION_TYPES, NotificationItem } from '../../core/models/notifications.models';
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
  imports: [FormsModule, RouterLink, RelativeTimePipe, AuthError],
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

  /**
   * Per-type mute state. Checked = notifies; unchecking saves immediately (whole-set
   * PUT, same pattern as keyword filters). Muted types are never CREATED server-side,
   * so unmuting reveals only future events — the list is never re-filtered locally.
   */
  protected readonly typeOptions = NOTIFICATION_TYPES;
  protected readonly muted = signal<Set<string>>(new Set());
  protected readonly typesSaving = signal(false);

  constructor() {
    this.subscription = this.realtime.notification$.subscribe(() => this.reload());
    this.subscription.add(
      this.realtime.resync$.subscribe((hub) => {
        if (hub === 'notifications') this.reload();
      }),
    );
    this.reload();
    this.notifications.getMutedTypes().subscribe({
      next: (res) => this.muted.set(new Set(res.mutedTypes)),
      error: () => undefined, // toggles keep their defaults; the list is unaffected
    });
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

  protected isMuted(type: string): boolean {
    return this.muted().has(type);
  }

  protected toggleType(type: string, notify: boolean): void {
    if (this.typesSaving()) return;
    const next = new Set(this.muted());
    if (notify) next.delete(type);
    else next.add(type);
    this.typesSaving.set(true);
    this.notifications.updateMutedTypes([...next]).subscribe({
      next: (res) => {
        // Adopt the server echo (unknown names dropped there), not our guess.
        this.muted.set(new Set(res.mutedTypes));
        this.typesSaving.set(false);
      },
      error: () => this.typesSaving.set(false),
    });
  }

  /**
   * The verb half of the row. The actor name renders separately as a profile link,
   * so this returns only what follows it ("started following you", …).
   */
  protected actionText(type: string): string {
    switch (type) {
      case 'NewFollower':
        return 'started following you';
      case 'NewLike':
        return 'liked your post';
      case 'NewComment':
        return 'commented on your post';
      case 'NewMessage':
        return 'sent you a message';
      default:
        return 'interacted with you';
    }
  }

  protected describe(n: NotificationItem): string {
    return `${n.actor.displayName} ${this.actionText(n.type)}`;
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
