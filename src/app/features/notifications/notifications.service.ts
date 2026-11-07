import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { NotificationsEndpoints, UsersEndpoints } from '../../core/config/endpoints';
import {
  NotificationListResponse,
  NotificationSnoozeResponse,
  NotificationTypesResponse,
  UnreadCountResponse,
} from '../../core/models/notifications.models';

/**
 * Notification transport plus the shared unread badge state. The count lives HERE
 * (not in the shell) so every writer — pushes, reconnects, navigations, mark-all-read —
 * updates the one signal the bell renders. A read in one place must clear the badge
 * everywhere, with no refresh needed.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(ApiClient);

  /** Badge count. Single writer discipline: only refreshUnread() mutates it. */
  readonly unread = signal(0);

  /**
   * Silence-all instant (ISO string) or null when off. Same shared-state discipline
   * as unread: the bell and the page read this, actions write through it.
   */
  readonly snoozedUntil = signal<string | null>(null);

  list(): Observable<NotificationListResponse> {
    return this.api.get<NotificationListResponse>(NotificationsEndpoints.list);
  }

  unreadCount(): Observable<UnreadCountResponse> {
    return this.api.get<UnreadCountResponse>(NotificationsEndpoints.unreadCount);
  }

  /** Refetch the count into the shared signal. Failures keep the last count. */
  refreshUnread(): void {
    this.unreadCount().subscribe({
      next: (res) => this.unread.set(res.count),
      error: () => undefined,
    });
  }

  markAllRead(): Observable<void> {
    return this.api.post<void>(NotificationsEndpoints.markRead).pipe(
      // Clearing must move the badge immediately — not on the next push or reload.
      tap({ next: () => this.unread.set(0), error: () => undefined }),
    );
  }

  /**
   * Mark one notification read. The server returns the authoritative badge count, so this
   * single action keeps the bell correct without a second unread-count request.
   */
  markRead(id: string): Observable<UnreadCountResponse> {
    return this.api
      .post<UnreadCountResponse>(NotificationsEndpoints.markReadById(id))
      .pipe(tap((res) => this.unread.set(res.count)));
  }

  /** Delete one notification; an unread row also drops out of the badge count. */
  delete(id: string): Observable<UnreadCountResponse> {
    return this.api
      .delete<UnreadCountResponse>(NotificationsEndpoints.byId(id))
      .pipe(tap((res) => this.unread.set(res.count)));
  }

  loadSnooze(): void {
    this.api.get<NotificationSnoozeResponse>(UsersEndpoints.snooze).subscribe({
      next: (res) => this.snoozedUntil.set(res.snoozedUntil),
      error: () => undefined,
    });
  }

  /** Snooze until an ISO instant; adopts the server echo as the new state. */
  snoozeUntil(untilIso: string): Observable<NotificationSnoozeResponse> {
    return this.api
      .post<NotificationSnoozeResponse>(UsersEndpoints.snooze, { until: untilIso })
      .pipe(tap((res) => this.snoozedUntil.set(res.snoozedUntil)));
  }

  /** Lift early — deterministically null afterwards, no refetch needed. */
  liftSnooze(): Observable<void> {
    return this.api
      .delete<void>(UsersEndpoints.snooze)
      .pipe(tap({ next: () => this.snoozedUntil.set(null), error: () => undefined }));
  }

  /** Muted type names (e.g. "NewFollower"). Whole-set replace on save. */
  getMutedTypes(): Observable<NotificationTypesResponse> {
    return this.api.get<NotificationTypesResponse>(UsersEndpoints.notificationTypes);
  }

  updateMutedTypes(mutedTypes: string[]): Observable<NotificationTypesResponse> {
    return this.api.patch<NotificationTypesResponse>(UsersEndpoints.notificationTypes, {
      mutedTypes,
    });
  }
}
