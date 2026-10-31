import { Component, inject, signal } from '@angular/core';
import { RelativeTimePipe } from '../../feed/relative-time.pipe';
import { ApiError } from '../../../core/models/api-error';
import { AuthError } from '../../auth/ui/auth-error';
import { AdminService } from '../admin.service';
import {
  TagModerationQueueResponse,
  ModerateTagRequest,
  TAG_MODERATION_ACTIONS,
} from '../../../core/models/admin.models';

/**
 * Tag queue (`/admin/tags`): tags created by users that sit at PendingReview until a
 * moderator approves them. Approve to make public, archive to hide, ban to block entirely.
 * Without this queue every new tag reads "you're first" — see test/issues.md #1.
 */
@Component({
  selector: 'fc-admin-tags',
  imports: [RelativeTimePipe, AuthError],
  templateUrl: './tags.html',
  styleUrl: './tags.scss',
})
export class Tags {
  private readonly admin = inject(AdminService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly tags = signal<TagModerationQueueResponse['tags']>([]);

  protected readonly moderating = signal<string | null>(null); // tag id in flight

  constructor() {
    this.reload();
  }

  protected retry(): void {
    this.error.set(null);
    this.reload();
  }

  protected moderate(tagId: string, action: ModerateTagRequest['action']): void {
    if (this.moderating() === tagId) return;

    this.moderating.set(tagId);
    this.admin.moderateTag(tagId, { action }).subscribe({
      next: () => {
        this.moderating.set(null);
        this.tags.set(this.tags().filter((t) => t.tagId !== tagId));
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.moderating.set(null);
      },
    });
  }

  private reload(): void {
    this.loading.set(true);
    this.admin.getTagQueue().subscribe({
      next: (res) => {
        this.tags.set([...res.tags].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)));
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }
}
