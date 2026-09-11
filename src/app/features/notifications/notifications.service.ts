import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { NotificationsEndpoints } from '../../core/config/endpoints';
import {
  NotificationListResponse,
  UnreadCountResponse,
} from '../../core/models/notifications.models';

/** Notification transport. Mark-read clears the whole bell (server marks ALL). */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(ApiClient);

  list(): Observable<NotificationListResponse> {
    return this.api.get<NotificationListResponse>(NotificationsEndpoints.list);
  }

  unreadCount(): Observable<UnreadCountResponse> {
    return this.api.get<UnreadCountResponse>(NotificationsEndpoints.unreadCount);
  }

  markAllRead(): Observable<void> {
    return this.api.post<void>(NotificationsEndpoints.markRead);
  }
}
