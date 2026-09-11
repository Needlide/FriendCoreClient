/**
 * SignalR payloads. Both hubs are push-only (no client → server methods).
 * Treat every push as a "something changed" signal and reconcile via REST for the
 * canonical, hydrated data — the payloads are intentionally skinny (IDs only).
 */

/** Hub server → client method names (must match the server constants verbatim). */
export const NOTIFICATION_EVENT = 'NotificationReceived';
export const MESSAGE_EVENT = 'MessageReceived';

/** Payload of NotificationReceived (NotificationHub). */
export interface RealtimeNotification {
  /** NotificationType: "NewFollower" | "NewLike" | "NewComment" | "NewMessage". */
  type: string;
  actorId: string;
  /** The post / comment / message that triggered it. */
  entityId: string;
  createdAt: string;
}

/** Payload of MessageReceived (MessagingHub). Only the recipient receives this. */
export interface MessageResponse {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  /** MessageStatus: "Sent" | "Delivered" | "Read". */
  status: string;
  createdAt: string;
}

export type HubName = 'notifications' | 'messaging';

export type RealtimeState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
