import { Component, inject, input, signal } from '@angular/core';
import { SocialService } from './social.service';

type FollowState = 'idle' | 'saving' | 'following';

/**
 * Shared follow toggle (components.md §FollowButton). One tiny state machine:
 * idle → saving → following (or back to idle on error — a failed follow must never
 * display as done). Used by onboarding rows, discovery cards, and future profiles.
 */
@Component({
  selector: 'fc-follow-button',
  template: `
    @switch (state()) {
      @case ('following') {
        <button
          type="button"
          class="fc-secondary"
          (click)="toggle()"
          [attr.aria-label]="'Unfollow ' + username()"
        >
          Following
        </button>
      }
      @case ('saving') {
        <button type="button" class="fc-secondary" disabled>…</button>
      }
      @default {
        <button
          type="button"
          class="fc-primary"
          (click)="toggle()"
          [attr.aria-label]="'Follow ' + username()"
        >
          Follow
        </button>
      }
    }
  `,
  styleUrl: './follow-button.scss',
})
export class FollowButton {
  private readonly social = inject(SocialService);

  username = input.required<string>();

  protected readonly state = signal<FollowState>('idle');

  protected toggle(): void {
    const current = this.state();
    if (current === 'saving') return;
    const following = current === 'following';
    this.state.set('saving');
    const call = following
      ? this.social.unfollow(this.username())
      : this.social.follow(this.username());
    call.subscribe({
      next: () => this.state.set(following ? 'idle' : 'following'),
      error: () => this.state.set(following ? 'following' : 'idle'),
    });
  }
}
