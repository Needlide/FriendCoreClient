import { Component, inject, signal } from '@angular/core';
import { DiscoveryService } from '../discovery/discovery.service';
import { ApiError } from '../../core/models/api-error';
import { DiscoveryPerson } from '../../core/models/tags.models';
import { FollowButton } from '../social/follow-button';

type LoadState = 'loading' | 'ready' | 'failed';

/**
 * Step 2 of onboarding: suggested follows from tag-overlap discovery.
 * Loads once on init; rows use the shared FollowButton (own state machine each).
 * Skipping is always allowed — an empty home feed has its own CTA to Discover.
 */
@Component({
  selector: 'fc-suggested-follows',
  imports: [FollowButton],
  templateUrl: './suggested-follows.html',
  styleUrl: './suggested-follows.scss',
})
export class SuggestedFollows {
  private readonly discovery = inject(DiscoveryService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly people = signal<DiscoveryPerson[]>([]);
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    this.load();
  }

  protected retry(): void {
    this.error.set(null);
    this.load();
  }

  private load(): void {
    this.state.set('loading');
    this.discovery.getPeople().subscribe({
      next: (res) => {
        // Show at most 10 — the spec's cold-start window (§9.3); the rest live in Discover.
        this.people.set(res.people.slice(0, 10));
        this.state.set('ready');
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.state.set('failed');
      },
    });
  }
}
