import { Injectable, computed, inject, signal } from '@angular/core';
import { RealtimeService } from '../realtime/realtime.service';
import { MessagingService } from '../../features/messaging/messaging.service';
import { firstValueFrom } from 'rxjs';

/**
 * Total unread messages, for the nav badge.
 *
 * <p>Deliberately a count and not "did anything change": the notification bell already owns
 * "you have something new", and a second indicator meaning the same thing trains people to ignore
 * both. What the badge adds is the one thing the bell cannot say — how much is waiting.
 *
 * <p>Counts are per conversation, held here rather than only summed, because the two ways the
 * count moves are both per conversation: opening a thread clears exactly one of them, and an
 * arriving message increments exactly one. A single running total could not do either without
 * being reset wholesale, which would lose the others.
 */
@Injectable({ providedIn: 'root' })
export class UnreadService {
  private readonly realtime = inject(RealtimeService);
  private readonly messaging = inject(MessagingService);

  private readonly counts = signal<ReadonlyMap<string, number>>(new Map());

  /** Messages waiting across every conversation. */
  readonly total = computed(() => {
    let sum = 0;
    for (const count of this.counts().values()) sum += count;
    return sum;
  });

  /** Per-conversation counts, for a list that wants its own per-row badge. */
  readonly byConversation = computed(() => this.counts());

  constructor() {
    // One subscription, here, rather than in every component that might care. The badge must be
    // right on the nav even when no messages page or thread is open, which is exactly when
    // nothing else would be listening.
    this.realtime.message$.subscribe((message) => this.increment(message.conversationId));
  }

  /**
   * First read, from the conversations list — the only endpoint that already carries every
   * conversation's unread count.
   *
   * <p>Best-effort: a failure here leaves the badge at zero, and the conversations page or the
   * next arriving message will correct it. The badge being briefly wrong beats the shell failing
   * to render because a count could not be fetched.
   */
  async load(): Promise<void> {
    try {
      const feed = await firstValueFrom(this.messaging.conversations());
      this.setAll(feed.conversations);
    } catch {
      // Deliberately swallowed — see above. The nav is not worth an error state over.
    }
  }

  /** Replaces everything from an authoritative server list, so reloads cannot double-count. */
  setAll(conversations: ReadonlyArray<{ id: string; unreadCount: number }>): void {
    const next = new Map<string, number>();
    for (const conversation of conversations) {
      if (conversation.unreadCount > 0) next.set(conversation.id, conversation.unreadCount);
    }
    this.counts.set(next);
  }

  increment(conversationId: string): void {
    this.counts.update((current) => {
      const next = new Map(current);
      next.set(conversationId, (next.get(conversationId) ?? 0) + 1);
      return next;
    });
  }

  /** The reader has seen this conversation — mark it read locally rather than waiting for a refetch. */
  clear(conversationId: string): void {
    this.counts.update((current) => {
      if (!current.has(conversationId)) return current;
      const next = new Map(current);
      next.delete(conversationId);
      return next;
    });
  }

  /**
   * Signed out (or a different user signed in): every count belonged to the previous account, and
   * leaving them up would show one user's unread messages to the next.
   */
  reset(): void {
    this.counts.set(new Map());
  }
}
