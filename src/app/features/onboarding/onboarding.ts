import { Component, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TagsService } from '../tags/tags.service';
import { ApiError } from '../../core/models/api-error';
import { AuthError } from '../auth/ui/auth-error';
import { SuggestedFollows } from './suggested-follows';
import { TagsStep } from './tags-step';

/**
 * Two-step onboarding (UI-Plan §1, `/onboarding`):
 *   1. TagsStep — pick ≥1 tag (required: discovery can't match on zero tags).
 *   2. SuggestedFollows — follow 0..n people (always skippable).
 *
 * Flow control lives here; each step owns its own UI state. Saving happens ONCE,
 * on leaving step 1 (PUT replaces the whole list), so typing never hits the network
 * until the user commits with Continue. Step 2 then reads fresh discovery results
 * computed from the just-saved tags.
 */
@Component({
  selector: 'fc-onboarding',
  imports: [TagsStep, SuggestedFollows, AuthError],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding {
  private readonly tags = inject(TagsService);
  private readonly router = inject(Router);

  private readonly tagsStep = viewChild(TagsStep);

  protected readonly step = signal<1 | 2>(1);
  protected readonly saving = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected continueFromTags(): void {
    const selection = this.tagsStep()?.tags() ?? [];
    if (selection.length === 0 || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.tags.updateProfileTags(selection).subscribe({
      next: () => {
        this.saving.set(false);
        this.step.set(2);
      },
      error: (err: unknown) => {
        // Stay on step 1 with the selection intact — the user fixes and retries.
        this.error.set(err instanceof ApiError ? err : null);
        this.saving.set(false);
      },
    });
  }

  protected finish(): void {
    void this.router.navigate(['/']);
  }
}
