/**
 * SignalR payloads. Both hubs are push-only (no client → server methods).
 * Treat every push as a "something changed" signal and reconcile via REST for the
 * canonical, hydrated data — the payloads are intentionally skinny (IDs only).
 */

import type { PostMedia } from './posts.models';

/** Hub server → client method names (must match the server constants verbatim). */
export const NOTIFICATION_EVENT = 'NotificationReceived';
export const MESSAGE_EVENT = 'MessageReceived';
export const MESSAGE_EDITED_EVENT = 'MessageEdited';
export const MESSAGE_DELETED_EVENT = 'MessageDeleted';

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
  /** Null for an attachment-only message — the bubble renders from `media` instead. */
  content: string | null;
  status: string;
  createdAt: string;
  /** Same shape a post's media uses, so MediaViewer renders either. */
  media: PostMedia | null;
  /** Set the first time the sender rewrote the text; null means never edited. */
  editedAt: string | null;
}

/**
 * Payload of MessageEdited and MessageDeleted (MessagingHub). Unlike MessageReceived, both
 * participants receive these — the sender's other devices need them too. Ids only for a
 * delete: the content is already gone server-side, and a refetch would learn nothing more.
 */
export interface MessageDeletedPayload {
  messageId: string;
}

export type HubName = 'notifications' | 'messaging';

export type RealtimeState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
