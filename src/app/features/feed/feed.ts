import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models/api-error';
import { Post } from '../../core/models/posts.models';
import { AuthError } from '../auth/ui/auth-error';
import { Composer } from './composer';
import { FeedService } from './feed.service';
import { PostCard } from './post-card';

/**
 * Home feed (`/`, UI-Plan §1): composer on top, chronological cards below.
 * Cursor pagination with an explicit "Load more" button — never infinite scroll
 * (calm-UX principle, COGA checklist). `nextCursor === null` is the end; the API
 * fixes the page at 20, so a short page without a cursor also ends the feed.
 *
 * Deletion and publishing mutate the LOCAL list (drop / prepend) — no refetch,
 * no lost scroll position. Errors that escape here render the global retry block.
 */
@Component({
  selector: 'fc-feed',
  imports: [RouterLink, Composer, PostCard, AuthError],
  templateUrl: './feed.html',
  styleUrl: './feed.scss',
})
export class Feed {
  private readonly feed = inject(FeedService);
  protected readonly auth = inject(AuthService);

  protected readonly posts = signal<Post[]>([]);
  protected readonly nextCursor = signal<string | null | undefined>(undefined);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    this.loadFirst();
  }

  protected get exhausted(): boolean {
    return this.nextCursor() === null;
  }

  private loadFirst(): void {
    this.loading.set(true);
    this.feed.getHome().subscribe({
      next: (res) => {
        this.posts.set(res.posts);
        this.nextCursor.set(res.nextCursor);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }

  protected loadMore(): void {
    const cursor = this.nextCursor();
    if (this.loadingMore() || cursor === null || cursor === undefined) return;
    this.loadingMore.set(true);
    this.feed.getHome(cursor).subscribe({
      next: (res) => {
        // Append, guarding against duplicates if the feed shifted mid-scroll.
        const seen = new Set(this.posts().map((p) => p.id));
        this.posts.update((posts) => [...posts, ...res.posts.filter((p) => !seen.has(p.id))]);
        this.nextCursor.set(res.nextCursor);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  protected retry(): void {
    this.error.set(null);
    this.loadFirst();
  }

  /** Template entry points — public because templates can only call public members. */
  prepend(post: Post): void {
    this.posts.update((posts) => [post, ...posts]);
  }

  drop(id: string): void {
    this.posts.update((posts) => posts.filter((p) => p.id !== id));
  }
}
