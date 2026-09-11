import { Component, computed, signal } from '@angular/core';
import { TagInput } from '../tags/tag-input';
import {
  MAX_PRIMARY_TAGS,
  MAX_SECONDARY_TAGS,
  ProfileTagInput,
  ProfileTagTier,
} from '../../core/models/tags.models';

/**
 * Step 1 of onboarding: pick profile tags. Two tiers with different matching weight
 * (primary +10, secondary +3 per shared tag — spec §6.6), each tag either public
 * (shown on the profile) or private (matching only).
 *
 * This component owns the *selection* state only — plain array + computed counts.
 * It emits the finished list upward; the onboarding shell owns saving (PUT), so this
 * step is reusable later in Settings → Profile tags without changes.
 */
@Component({
  selector: 'fc-tags-step',
  imports: [TagInput],
  templateUrl: './tags-step.html',
  styleUrl: './tags-step.scss',
})
export class TagsStep {
  protected readonly maxPrimary = MAX_PRIMARY_TAGS;
  protected readonly maxSecondary = MAX_SECONDARY_TAGS;

  private readonly selected = signal<ProfileTagInput[]>([]);

  protected readonly primary = computed(() => this.selected().filter((t) => t.tier === 'Primary'));
  protected readonly secondary = computed(() =>
    this.selected().filter((t) => t.tier === 'Secondary'),
  );
  /** At least one tag is required — discovery has nothing to match on otherwise. */
  readonly hasAny = computed(() => this.selected().length > 0);

  /** Snapshot for the parent to save. */
  tags(): ProfileTagInput[] {
    return this.selected();
  }

  /** Template + spec entry points — public because templates can only call public members. */
  add(name: string, tier: ProfileTagTier): void {
    const clean = name.trim();
    if (!clean) return;
    const limit = tier === 'Primary' ? MAX_PRIMARY_TAGS : MAX_SECONDARY_TAGS;
    const count = this.selected().filter((t) => t.tier === tier).length;
    // Case-insensitive dedupe: the server normalizes to slugs, so "Synths" and
    // "synths" are the same tag — catching it here avoids a confusing 400 later.
    const exists = this.selected().some((t) => t.name.toLowerCase() === clean.toLowerCase());
    if (count >= limit || exists) return;
    this.selected.update((tags) => [...tags, { name: clean, tier, isPublic: true }]);
  }

  remove(name: string, tier: ProfileTagTier): void {
    this.selected.update((tags) => tags.filter((t) => !(t.name === name && t.tier === tier)));
  }

  toggleVisibility(name: string, tier: ProfileTagTier): void {
    this.selected.update((tags) =>
      tags.map((t) => (t.name === name && t.tier === tier ? { ...t, isPublic: !t.isPublic } : t)),
    );
  }
}
