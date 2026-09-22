import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { NotificationsEndpoints, UsersEndpoints } from '../../core/config/endpoints';
import {
  NotificationListResponse,
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
