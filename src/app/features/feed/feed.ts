import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models/api-error';
import { Post } from '../../core/models/posts.models';
import { AuthError } from '../auth/ui/auth-error';
import { Composer } from './composer';
import { FeedService } from './feed.service';
import { PostCard } from './post-card';

/**
 * Home feed (`/`, UI-Plan §1): chronological cards, plus a "New post" button that
 * opens the composer in a modal. Cursor pagination with an explicit "Load more"
 * button — never infinite scroll (calm-UX principle, COGA checklist).
 * `nextCursor === null` is the end; the API fixes the page at 20, so a short page
 * without a cursor also ends the feed.
 *
 * The composer is a modal rather than an always-open panel: the home page is for
 * reading, and posting is a deliberate act (spec §9.1 keeps the feed follow-only and
 * chronological; nothing in it asks the reader to write first). The modal keeps the
 * component mounted while closed, so an accidental Escape does not discard a draft.
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

  private readonly composerDialog = viewChild<ElementRef<HTMLDialogElement>>('composerDialog');

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

  /** Open the composer, putting the cursor in the textarea rather than on ✕. */
  protected openComposer(): void {
    const dialog = this.composerDialog()?.nativeElement;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    dialog.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }

  protected closeComposer(): void {
    this.composerDialog()?.nativeElement.close();
  }

  /** A click whose target is the dialog itself is a backdrop click (contents bubble). */
  protected onComposerBackdrop(event: MouseEvent): void {
    if (event.target === this.composerDialog()?.nativeElement) this.closeComposer();
  }

  /** Publishing is the one action that should dismiss the modal by itself. */
  protected onPostCreated(post: Post): void {
    this.prepend(post);
    this.closeComposer();
  }

  /** Template entry points — public because templates can only call public members. */
  prepend(post: Post): void {
    this.posts.update((posts) => [post, ...posts]);
  }

  drop(id: string): void {
    this.posts.update((posts) => posts.filter((p) => p.id !== id));
  }
}
