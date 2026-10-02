import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models/api-error';
import { Post, PostComment } from '../../core/models/posts.models';
import { AuthError } from '../auth/ui/auth-error';
import { FeedService } from '../feed/feed.service';
import { PostCard } from '../feed/post-card';
import { LinkifiedText } from '../shared/linkified-text';
import { RelativeTimePipe } from './relative-time.pipe';

/**
 * Post detail (`/posts/:id`): the full post plus its comments. Comments arrive
 * newest-first like messages, so the page reverses to oldest-at-top and prepends
 * older pages — the same merge discipline as the message thread. Own comments get
 * a delete action; adding appends from the POST response (no refetch).
 */
@Component({
  selector: 'fc-post-detail',
  imports: [RouterLink, ReactiveFormsModule, PostCard, AuthError, LinkifiedText, RelativeTimePipe],
  templateUrl: './post-detail.html',
  styleUrl: './post-detail.scss',
})
export class PostDetail implements OnDestroy {
  private readonly feed = inject(FeedService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private subscription = new Subscription();

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly notFound = signal(false);
  protected readonly post = signal<Post | null>(null);
  protected readonly comments = signal<PostComment[]>([]);
  protected readonly nextCursor = signal<string | null | undefined>(undefined);
  protected readonly loadingOlder = signal(false);
  protected readonly sending = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(500)]],
  });

  private postId = '';

  constructor() {
    this.subscription.add(
      this.route.paramMap.subscribe((params) => {
        const id = params.get('id');
        if (id) {
          this.postId = id;
          this.load();
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  protected isSelf(): boolean {
    return this.post()?.authorId === this.auth.session()?.userId;
  }

  protected isOwnComment(c: PostComment): boolean {
    return c.authorId === this.auth.session()?.userId;
  }

  protected loadOlder(): void {
    const cursor = this.nextCursor();
    if (this.loadingOlder() || cursor === null || cursor === undefined) return;
    this.loadingOlder.set(true);
    this.subscription.add(
      this.feed.getComments(this.postId, cursor).subscribe({
        next: (res) => {
          const seen = new Set(this.comments().map((c) => c.id));
          const older = [...res.comments].reverse().filter((c) => !seen.has(c.id));
          this.comments.update((current) => [...older, ...current]);
          this.nextCursor.set(res.nextCursor);
          this.loadingOlder.set(false);
        },
        error: () => this.loadingOlder.set(false),
      }),
    );
  }

  protected addComment(): void {
    const content = this.form.controls.content.value.trim();
    if (!content || this.sending()) return;
    this.sending.set(true);
    this.subscription.add(
      this.feed.addComment(this.postId, content).subscribe({
        next: (comment) => {
          this.comments.update((current) =>
            current.some((c) => c.id === comment.id) ? current : [...current, comment],
          );
          this.form.reset({ content: '' });
          this.sending.set(false);
        },
        error: () => this.sending.set(false),
      }),
    );
  }

  protected deleteComment(id: string): void {
    this.subscription.add(
      this.feed.deleteComment(id).subscribe({
        next: () => this.comments.update((current) => current.filter((c) => c.id !== id)),
      }),
    );
  }

  protected dropPost(): void {
    // The post no longer exists — staying would show a ghost. Home, not back:
    // the visitor may have arrived from a shared link with no history.
    void this.router.navigate(['/']);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);
    this.subscription.add(
      this.feed.getPost(this.postId).subscribe({
        next: (post) => {
          this.post.set(post);
          this.loading.set(false);
          this.loadComments();
        },
        error: (err: unknown) => {
          this.loading.set(false);
          if (err instanceof ApiError && err.status === 404) this.notFound.set(true);
          else this.error.set(err instanceof ApiError ? err : null);
        },
      }),
    );
  }

  private loadComments(): void {
    this.subscription.add(
      this.feed.getComments(this.postId).subscribe({
        next: (res) => {
          this.comments.set([...res.comments].reverse());
          this.nextCursor.set(res.nextCursor);
        },
        error: () => undefined,
      }),
    );
  }
}
