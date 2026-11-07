import { Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiError } from '../../core/models/api-error';
import { UserSummary } from '../../core/models/profile.models';
import { AuthError } from '../auth/ui/auth-error';
import { FeedService } from './feed.service';

/**
 * Likers dialog (components.md §PostCard). A native <dialog> opened from the like count.
 * The list is fetched when opened rather than with every feed page: most readers never open
 * it, and like counts change under the card all the time.
 */
@Component({
  selector: 'fc-likers-dialog',
  imports: [RouterLink, AuthError],
  templateUrl: './likers-dialog.html',
  styleUrl: './likers-dialog.scss',
})
export class LikersDialog {
  private readonly feed = inject(FeedService);

  postId = input.required<string>();

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly users = signal<UserSummary[]>([]);

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  /** Parents call this from the like count. */
  open(): void {
    this.users.set([]);
    this.error.set(null);
    this.loading.set(true);
    this.dialog()?.nativeElement.showModal();
    this.feed.getLikes(this.postId()).subscribe({
      next: (res) => {
        this.users.set(res.users);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }

  protected close(): void {
    this.dialog()?.nativeElement.close();
  }

  protected initials(displayName: string): string {
    const name = displayName.trim();
    return name.length > 0 ? name[0]!.toUpperCase() : '?';
  }
}
