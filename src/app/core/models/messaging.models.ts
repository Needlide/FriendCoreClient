import { MessageResponse } from './realtime.models';
import { UserSummary } from './profile.models';

/** One row of GET /conversations. */
export interface Conversation {
  id: string;
  otherParticipant: UserSummary;
  lastMessageAt: string;
  unreadCount: number;
}

export interface ConversationListResponse {
  conversations: Conversation[];
}

/** GET /conversations/{id}/messages — newest-first; the thread displays reversed. */
export interface MessageFeedResponse {
  messages: MessageResponse[];
  nextCursor: string | null;
}

/**
 * GET /conversations/{id}/messages/{messageId}/around — a window centred on one message.
 *
 * Already oldest-first, unlike the feed: the window is built outward from the target rather than
 * cut from one end, so the server returns it in reading order and the client must NOT reverse it.
 * Both cursors are present because a jumped-to message has history on either side.
 */
export interface MessageWindowResponse {
  messages: MessageResponse[];
  olderCursor: string | null;
  newerCursor: string | null;
}
