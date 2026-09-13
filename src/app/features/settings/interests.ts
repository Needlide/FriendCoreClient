import { Component, inject, signal, viewChild } from '@angular/core';
import { TagsService } from '../tags/tags.service';
import { ApiError } from '../../core/models/api-error';
import { ProfileTagInput, ProfileTagTier } from '../../core/models/tags.models';
import { AuthError } from '../auth/ui/auth-error';
import { TagsStep } from '../onboarding/tags-step';

/**
 * Interests (`/settings/interests`): edit profile tags any time — the recovery path
 * for anyone who skipped onboarding. Same TagsStep as onboarding, prefilled from the
 * read endpoint; saving replaces the whole list (PUT), including down to empty.
 */
@Component({
  selector: 'fc-interests',
  imports: [TagsStep, AuthError],
  templateUrl: './interests.html',
  styleUrl: './interests.scss',
})
export class Interests {
  private readonly tagsApi = inject(TagsService);

  private readonly tagsStep = viewChild(TagsStep);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly serverTags = signal<ProfileTagInput[] | null>(null);

  constructor() {
    this.tagsApi.getProfileTags().subscribe({
      next: (res) => {
        this.serverTags.set(
          res.tags.map((t) => ({
            name: t.name,
            tier: (t.tier === 'Primary' ? 'Primary' : 'Secondary') as ProfileTagTier,
            isPublic: t.isPublic,
          })),
        );
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }

  protected save(): void {
    const selection = this.tagsStep()?.tags() ?? [];
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    this.tagsApi.updateProfileTags(selection).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.set(true);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.saving.set(false);
      },
    });
  }
}
