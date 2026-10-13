import { Component, effect, inject, input, signal, untracked } from '@angular/core';
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

  /**
   * Whether the viewer already follows this user, from the server.
   *
   * Without this the button can only know it is following if you clicked it in this
   * session, so a refresh silently reverts it to "Follow" while the follow is still in
   * effect — the button and the server then disagree. Seeding from the profile payload
   * keeps them in step on every cold load.
   */
  isFollowing = input(false);

  protected readonly state = signal<FollowState>('idle');

  constructor() {
    // effect() rather than reading the input once: the profile loads asynchronously, so
    // the input changes from false to true after this component is created.
    effect(() => {
      const following = this.isFollowing();
      untracked(() => {
        const current = this.state();
        if (current !== 'saving') this.state.set(following ? 'following' : 'idle');
      });
    });
  }

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
