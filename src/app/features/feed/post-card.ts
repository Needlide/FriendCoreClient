import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Post } from '../../core/models/posts.models';
import { ReportTarget } from '../../core/models/settings.models';
import { FeedService } from './feed.service';
import { MediaViewer } from './media-viewer';
import { RelativeTimePipe } from './relative-time.pipe';
import { ReportDialog } from '../safety/report-dialog';

/**
 * One post in the feed (`<article>`, per components.md). Owns exactly one piece of
 * mutable UI state — the like toggle — everything else renders straight from input.
 *
 * Optimistic like, and why the rollback matters: the server is the source of truth
 * for counts (denormalised LikeCount), so we flip the UI instantly for snappiness
 * but revert on ANY error. A failed like must never display a count the server
 * doesn't have — same principle as the follow rollback in onboarding.
 *
 * Note: PostResponse carries no avatar URL, so the avatar is initials
 * (components.md allows initials fallback). A real photo arrives with profile
 * media work later.
 */
@Component({
  selector: 'fc-post-card',
  imports: [RouterLink, MediaViewer, RelativeTimePipe, ReportDialog],
  templateUrl: './post-card.html',
  styleUrl: './post-card.scss',
})
export class PostCard {
  private readonly feed = inject(FeedService);
  private readonly destroyRef = inject(DestroyRef);

  post = input.required<Post>();
  /** Show the delete action (feed passes true only for the viewer's own posts). */
  canDelete = input(false);
  /** Fires after the server confirms deletion so the feed can drop the card. */
  readonly deleted = output<string>();

  private readonly liked = signal<boolean | null>(null);
  private readonly likeDelta = signal(0);
  /** In-flight delete guard — re-arms on failure so the action stays retryable. */
  protected readonly deleting = signal(false);

  /** Effective liked state: optimistic override wins until the request settles. */
  protected isLiked(): boolean {
    return this.liked() ?? this.post().isLikedByCurrentUser;
  }

  protected likeCount(): number {
    return this.post().likeCount + this.likeDelta();
  }

  protected initials(): string {
    const name = this.post().authorDisplayName.trim();
    return name.length > 0 ? name[0]!.toUpperCase() : '?';
  }

  protected toggleLike(): void {
    const target = !this.isLiked();
    // Snapshot for rollback; then flip instantly for snappiness.
    const snapshot = { liked: this.liked(), delta: this.likeDelta() };
    this.liked.set(target);
    this.likeDelta.set(target === this.post().isLikedByCurrentUser ? 0 : target ? 1 : -1);
    const call = target ? this.feed.like(this.post().id) : this.feed.unlike(this.post().id);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      // Success: the optimistic state already equals the confirmed state — nothing to do.
      // (Concurrent likes elsewhere reconcile on the next feed load.)
      next: () => undefined,
      // Failure: restore the snapshot so a failed like never displays.
      error: () => {
        this.liked.set(snapshot.liked);
        this.likeDelta.set(snapshot.delta);
      },
    });
  }

  protected delete(): void {
    if (this.deleting()) return;
    this.deleting.set(true);
    this.feed
      .deletePost(this.post().id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.deleted.emit(this.post().id),
        // Keep the card visible and re-arm the button — a failed delete must not
        // look like it worked. An unhandled error here used to reach the global
        // ErrorHandler with no feedback on screen at all.
        error: () => this.deleting.set(false),
      });
  }

  protected reportTarget(): ReportTarget {
    return { kind: 'post', id: this.post().id };
  }

  protected openReport(dialog: ReportDialog): void {
    dialog.open();
  }
}
