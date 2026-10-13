import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { ConversationsEndpoints } from '../../core/config/endpoints';
import {
  Conversation,
  ConversationListResponse,
  MessageFeedResponse,
  MessageWindowResponse,
} from '../../core/models/messaging.models';
import { MessageResponse, ReactionResponse } from '../../core/models/realtime.models';

/** Conversation + message transport. Realtime pushes (message$) only trigger refetches. */
@Injectable({ providedIn: 'root' })
export class MessagingService {
  private readonly api = inject(ApiClient);

  conversations(): Observable<ConversationListResponse> {
    return this.api.get<ConversationListResponse>(ConversationsEndpoints.list);
  }

  /** Find-or-create a 1:1 by username (used by the profile Message button). */
  start(username: string): Observable<Conversation> {
    return this.api.post<Conversation>(ConversationsEndpoints.start, { username });
  }

  /** Find-or-create the 1:1 with the admin support inbox. */
  startSupport(): Observable<Conversation> {
    return this.api.post<Conversation>(ConversationsEndpoints.support);
  }

  /** Newest-first page; cursor omitted for the latest page. */
  messages(id: string, cursor?: string | null): Observable<MessageFeedResponse> {
    return this.api.get<MessageFeedResponse>(ConversationsEndpoints.messages(id), {
      params: cursor ? { cursor } : {},
    });
  }

  /**
   * Send a message. `mediaId` is an item already uploaded through POST /media and owned
   * by the caller — the same two-step flow posts use, so an image is uploaded once and
   * can then be used in either place. Pass text, an attachment, or both; the server
   * rejects a request with neither, and never invents placeholder text for a bare image.
   *
   * `replyToMessageId` is optional and conversation-scoped server-side: an id from another
   * thread, or one that has since been deleted, comes back 404 rather than producing a quote
   * with nothing in it.
   */
  send(
    id: string,
    content: string | null,
    mediaId?: string | null,
    replyToMessageId?: string | null,
  ): Observable<MessageResponse> {
    return this.api.post<MessageResponse>(ConversationsEndpoints.messages(id), {
      content: content?.trim() ? content.trim() : null,
      mediaId: mediaId ?? null,
      replyToMessageId: replyToMessageId ?? null,
    });
  }

  markRead(id: string): Observable<void> {
    return this.api.post<void>(ConversationsEndpoints.markRead(id));
  }

  /**
   * Rewrites the text of one of your own messages. Returns the server's version so the bubble
   * shows the trimmed result rather than echoing the draft back. The server refuses an
   * attachment-only message outright, so the client hides the affordance there instead.
   *
   * `version` is the one the caller was looking at. The server answers 409
   * (`Messaging.MessageChanged`) if the message has moved on — almost always this same sender
   * saving from another device — instead of overwriting it.
   */
  editMessage(
    conversationId: string,
    messageId: string,
    content: string,
    version: number,
  ): Observable<MessageResponse> {
    return this.api.patch<MessageResponse>(
      ConversationsEndpoints.message(conversationId, messageId),
      { content, version },
    );
  }

  /**
   * Finds messages in one conversation containing a term. The whole term is matched as one
   * case-insensitive substring, so a remembered phrase finds that phrase.
   *
   * <p>Rejected below two characters rather than returning a wall of matches — the server decides
   * that, so the client never has to duplicate the rule.
   */
  searchMessages(conversationId: string, term: string): Observable<MessageFeedResponse> {
    return this.api.get<MessageFeedResponse>(ConversationsEndpoints.search(conversationId), {
      params: { q: term },
    });
  }

  /**
   * A window of the conversation centred on one message, oldest-first, with a cursor for each
   * direction. Two-way, unlike the feed — jumping to an old message means reading onwards from
   * there as often as backwards.
   */
  messagesAround(conversationId: string, messageId: string): Observable<MessageWindowResponse> {
    return this.api.get<MessageWindowResponse>(
      ConversationsEndpoints.around(conversationId, messageId),
    );
  }

  /**
   * Removes a message from YOUR view only. The sender keeps their copy of the text and the
   * attachment entirely, and is not told this happened; any image involved is recorded as
   * refused between you, so it cannot be sent again.
   */
  hideMessage(conversationId: string, messageId: string): Observable<void> {
    return this.api.post<void>(
      `${ConversationsEndpoints.message(conversationId, messageId)}/hide`,
      {},
    );
  }

  /**
   * Soft-deletes one of your own messages. The text is scrubbed and the message drops out of
   * the thread for both participants — nothing comes back to render.
   */
  deleteMessage(conversationId: string, messageId: string): Observable<void> {
    return this.api.delete<void>(ConversationsEndpoints.message(conversationId, messageId));
  }

  /**
   * Adds your reaction, or takes it back if you already hold it — one call for both, because
   * tapping a highlighted chip again is how everyone learns to undo. The server answers with
   * the emoji's resulting state (count 0 = drop the chip), which is what the chip renders
   * from; an emoji outside the server's allow-list comes back as a 400.
   */
  toggleReaction(
    conversationId: string,
    messageId: string,
    emoji: string,
  ): Observable<ReactionResponse> {
    return this.api.post<ReactionResponse>(
      ConversationsEndpoints.reactions(conversationId, messageId),
      { emoji },
    );
  }
}
