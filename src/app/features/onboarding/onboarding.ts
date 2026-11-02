import { Component, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TagsService } from '../tags/tags.service';
import { ApiError } from '../../core/models/api-error';
import { ProfileTagInput, ProfileTagTier } from '../../core/models/tags.models';
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
 *
 * Revisits (e.g. via the empty-feed CTA) prefill from the server instead of
 * starting blank — leaving and returning never loses or hides prior choices.
 */
@Component({
  selector: 'fc-onboarding',
  imports: [TagsStep, SuggestedFollows, AuthError, RouterLink],
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
  protected readonly serverTags = signal<ProfileTagInput[] | null>(null);

  constructor() {
    this.tags.getProfileTags().subscribe({
      next: (res) =>
        this.serverTags.set(
          res.tags.map((t) => ({
            name: t.name,
            tier: (t.tier === 'Primary' ? 'Primary' : 'Secondary') as ProfileTagTier,
            isPublic: t.isPublic,
          })),
        ),
      // Prefill is a courtesy — a failure just leaves a blank step, never an error.
      error: () => undefined,
    });
  }

  protected continueFromTags(): void {
    const selection = this.tagsStep()?.tags() ?? [];
    if (selection.length === 0 || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.tags.updateProfileTags(selection).subscribe({
      next: () => {
        this.saving.set(false);
        // Remember the saved list so Back from step 2 remounts step 1 prefilled
        // (TagsStep unmounts on step change; without this the typed tags vanish).
        this.serverTags.set(selection.map((t) => ({ ...t })));
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

  protected backToTags(): void {
    this.error.set(null);
    this.step.set(1);
  }
}
