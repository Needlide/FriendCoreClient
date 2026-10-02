import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { ConversationsEndpoints } from '../../core/config/endpoints';
import {
  Conversation,
  ConversationListResponse,
  MessageFeedResponse,
} from '../../core/models/messaging.models';
import { MessageResponse } from '../../core/models/realtime.models';

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
   */
  send(id: string, content: string | null, mediaId?: string | null): Observable<MessageResponse> {
    return this.api.post<MessageResponse>(ConversationsEndpoints.messages(id), {
      content: content?.trim() ? content.trim() : null,
      mediaId: mediaId ?? null,
    });
  }

  markRead(id: string): Observable<void> {
    return this.api.post<void>(ConversationsEndpoints.markRead(id));
  }
}
