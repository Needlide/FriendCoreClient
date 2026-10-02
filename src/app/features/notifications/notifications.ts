import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RelativeTimePipe } from '../feed/relative-time.pipe';
import { ApiError } from '../../core/models/api-error';
import { NOTIFICATION_TYPES, NotificationItem } from '../../core/models/notifications.models';
import { AuthError } from '../auth/ui/auth-error';
import { NotificationsService } from './notifications.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { EMPTY, Observable, Subject, Subscription, catchError, switchMap, tap } from 'rxjs';

/**
 * Notifications page (`/notifications`, UI-Plan §1). Hydrated REST list — the push
 * payloads are ID-only, so every `notification$` event (and every reconnect via
 * `resync$`) refetches the list rather than rendering the skinny push.
 * "Mark all read" clears the bell in one call (server marks ALL).
 *
 * Every refetch funnels through one switchMap'd trigger stream so a burst of pushes
 * can't deliver overlapping responses out of order, and `error` is cleared on every
 * attempt (not just on retry) so a transient failure never permanently masks a
 * list that has since loaded fine.
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
  protected readonly snoozeBusy = signal(false);

  private readonly destroyRef = inject(DestroyRef);
  private readonly reload$ = new Subject<void>();

  constructor() {
    this.subscription = this.realtime.notification$.subscribe(() => this.reload$.next());
    this.subscription.add(
      this.realtime.resync$.subscribe((hub) => {
        if (hub === 'notifications') this.reload$.next();
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
    this.notifications
      .getMutedTypes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => this.muted.set(new Set(res.mutedTypes)),
        error: () => undefined, // toggles keep their defaults; the list is unaffected
      });
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  protected markAllRead(): void {
    this.notifications
      .markAllRead()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.items.update((items) => items.map((n) => ({ ...n, isRead: true }))),
        error: () => undefined,
      });
  }

  protected isMuted(type: string): boolean {
    return this.muted().has(type);
  }

  /** Active silence instant, if any — read from the shared service state. */
  protected snoozedUntil(): string | null {
    const until = this.notifications.snoozedUntil();
    if (!until) return null;
    // A snooze that has already lapsed is not silence any more. The server stopped
    // sending hours ago; without this the page still reads "Silenced until …".
    const at = Date.parse(until);
    if (Number.isNaN(at) || at <= Date.now()) return null;
    return until;
  }

  /** Friendly local rendering of the until-instant ("today, 14:30"). */
  protected snoozedLabel(): string {
    const until = this.snoozedUntil();
    if (!until) return '';
    const date = new Date(until);
    const today = new Date();
    const sameDay =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return sameDay ? `today, ${time}` : `${date.toLocaleDateString()}, ${time}`;
  }

  /** Durations in hours, plus "until morning" (next 07:00 local). */
  protected snoozeForHours(hours: number): void {
    this.snoozeUntil(new Date(Date.now() + hours * 3_600_000).toISOString());
  }

  protected snoozeUntilMorning(): void {
    const morning = new Date();
    morning.setDate(morning.getDate() + 1);
    morning.setHours(7, 0, 0, 0);
    this.snoozeUntil(morning.toISOString());
  }

  private snoozeUntil(iso: string): void {
    if (this.snoozeBusy()) return;
    this.snoozeBusy.set(true);
    this.notifications
      .snoozeUntil(iso)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.snoozeBusy.set(false),
        error: () => this.snoozeBusy.set(false),
      });
  }

  protected liftSnooze(): void {
    if (this.snoozeBusy()) return;
    this.snoozeBusy.set(true);
    this.notifications
      .liftSnooze()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.snoozeBusy.set(false),
        error: () => this.snoozeBusy.set(false),
      });
  }

  protected toggleType(type: string, notify: boolean): void {
    if (this.typesSaving()) return;
    const next = new Set(this.muted());
    if (notify) next.delete(type);
    else next.add(type);
    this.typesSaving.set(true);
    this.notifications
      .updateMutedTypes([...next])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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
    this.reload$.next();
  }

  /**
   * Clears `error` up front: one failed push-triggered refresh used to leave the
   * error set forever, and since the template checks `@else if (error())` before
   * the list, every later successful refetch stayed invisible behind "Try again".
   */
  private fetch(): Observable<unknown> {
    this.loading.set(true);
    this.error.set(null);
    return this.notifications.list().pipe(
      tap((res) => {
        this.items.set(res.notifications);
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
