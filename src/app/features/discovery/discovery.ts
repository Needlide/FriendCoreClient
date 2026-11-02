import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DiscoveryService } from './discovery.service';
import { ApiError } from '../../core/models/api-error';
import { Post } from '../../core/models/posts.models';
import { DiscoveryPerson } from '../../core/models/tags.models';
import { AuthError } from '../auth/ui/auth-error';
import { PostCard } from '../feed/post-card';
import { UserCard } from '../social/user-card';

type Tab = 'people' | 'posts';

/**
 * Discovery (`/discover`, UI-Plan §1): two tabs, each a single non-paginated
 * response. People rows support follow + block/mute inline; a confirmed block
 * removes the row locally (the server hides blocked users everywhere anyway).
 * Posts reuse PostCard — likes work, delete is hidden (never your own posts here).
 */
@Component({
  selector: 'fc-discovery',
  imports: [UserCard, PostCard, AuthError, RouterLink],
  templateUrl: './discovery.html',
  styleUrl: './discovery.scss',
})
export class Discovery {
  private readonly discovery = inject(DiscoveryService);

  protected readonly tab = signal<Tab>('people');
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly people = signal<DiscoveryPerson[]>([]);
  protected readonly posts = signal<Post[]>([]);

  constructor() {
    this.load();
  }

  protected switchTab(tab: Tab): void {
    if (tab === this.tab()) return;
    this.tab.set(tab);
    // Lazy per tab: only fetch what the opened tab needs (each response is one shot).
    if (
      (tab === 'people' && this.people().length === 0) ||
      (tab === 'posts' && this.posts().length === 0)
    ) {
      this.load();
    }
  }

  protected retry(): void {
    this.error.set(null);
    this.load();
  }

  protected dropBlocked(username: string): void {
    this.people.update((people) => people.filter((p) => p.username !== username));
  }

  /** Muted users are excluded server-side on the next fetch — drop the row now. */
  protected dropMuted(event: { username: string; muted: boolean }): void {
    if (!event.muted) return;
    this.people.update((people) => people.filter((p) => p.username !== event.username));
  }

  private load(): void {
    this.loading.set(true);
    // Two separate subscriptions (not one union call): each branch narrows to its own
    // response type, so `res.people` / `res.posts` type-check without casts.
    if (this.tab() === 'people') {
      this.discovery.getPeople().subscribe({
        next: (res) => {
          this.people.set(res.people);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.error.set(err instanceof ApiError ? err : null);
          this.loading.set(false);
        },
      });
    } else {
      this.discovery.getPosts().subscribe({
        next: (res) => {
          this.posts.set(res.posts);
          this.loading.set(false);
        },
        error: (err: unknown) => {
          this.error.set(err instanceof ApiError ? err : null);
          this.loading.set(false);
        },
      });
    }
  }
}
