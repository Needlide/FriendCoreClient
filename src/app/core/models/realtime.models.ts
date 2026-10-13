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
export const MESSAGE_REACTION_EVENT = 'MessageReactionChanged';

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
  /** Emoji chips under the bubble. Empty array, never null — the server normalizes it. */
  reactions: ReactionResponse[];
  /**
   * Bumped by each accepted edit. An edit must send it back, so a rewrite based on a stale
   * view is refused rather than silently discarding the other device's save.
   */
  version: number;
  /** The quoted parent, when this message is a reply. Null for an ordinary message. */
  replyTo: MessageReferenceResponse | null;
}

/**
 * The quoted-parent reference. Resolved server-side because the parent may be soft-deleted or on
 * a page of history this thread has not loaded, so the client cannot look it up itself.
 */
export interface MessageReferenceResponse {
  id: string;
  senderId: string;
  /**
   * Short preview, or null when the parent had no text. `wasDeleted` tells "attached, no words"
   * apart from "gone" — they render differently and must not collapse.
   */
  excerpt: string | null;
  wasDeleted: boolean;
}

/**
 * One emoji chip: the glyph, how many people hold it, and whether this viewer is one of them
 * (which is what decides whether the chip is drawn highlighted).
 */
export interface ReactionResponse {
  emoji: string;
  count: number;
  reacted: boolean;
}

/**
 * Payload of MessageEdited and MessageDeleted (MessagingHub). Unlike MessageReceived, both
 * participants receive these — the sender's other devices need them too. Ids only for a
 * delete: the content is already gone server-side, and a refetch would learn nothing more.
 */
export interface MessageDeletedPayload {
  messageId: string;
}

/**
 * Payload of MessageReactionChanged. Carries the emoji's whole new state rather than an id,
 * so an open thread moves one chip instead of refetching a page to redraw a single emoji.
 * A `count` of 0 means the last holder released it and the client drops the chip — the same
 * vanish-don't-tombstone shape a deleted message uses.
 */
export interface MessageReactionChangedPayload {
  messageId: string;
  emoji: string;
  count: number;
  reacted: boolean;
}

export type HubName = 'notifications' | 'messaging';

export type RealtimeState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
