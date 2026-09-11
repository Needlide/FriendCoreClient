import { UserSummary } from './profile.models';

/** GET /notifications — hydrated list (push payloads are ID-only; this is display text source). */
export interface NotificationItem {
  id: string;
  /** NewFollower | NewLike | NewComment | NewMessage */
  type: string;
  actor: UserSummary;
  entityId: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: NotificationItem[];
}

/** GET /notifications/unread-count */
export interface UnreadCountResponse {
  count: number;
}
