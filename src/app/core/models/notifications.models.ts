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

/** GET /users/me/notification-types — type names the user muted (empty = all notify). */
export interface NotificationTypesResponse {
  mutedTypes: string[];
}

/** The four notifiable types with user-facing labels. */
export const NOTIFICATION_TYPES = [
  { value: 'NewFollower', label: 'New followers' },
  { value: 'NewLike', label: 'New likes' },
  { value: 'NewComment', label: 'New comments' },
  { value: 'NewMessage', label: 'New messages' },
] as const;
