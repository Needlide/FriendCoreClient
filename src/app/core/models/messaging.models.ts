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
