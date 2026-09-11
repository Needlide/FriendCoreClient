import { Component, input, output } from '@angular/core';
import { BlockMuteMenu } from './block-mute-menu';
import { FollowButton } from './follow-button';

/**
 * One person row (components.md §UserCard): initials avatar, names, optional bio,
 * follow toggle, and the block/mute menu. Dumb by design — it renders inputs and
 * re-emits the menu's `blocked` event; list state (removing the row) stays with
 * the parent that owns the array.
 */
@Component({
  selector: 'fc-user-card',
  imports: [FollowButton, BlockMuteMenu],
  templateUrl: './user-card.html',
  styleUrl: './user-card.scss',
})
export class UserCard {
  username = input.required<string>();
  displayName = input.required<string>();
  bio = input<string | null>(null);
  /** Fires after a confirmed block — parent drops the row. */
  readonly blocked = output<string>();

  protected initials(): string {
    const name = this.displayName().trim();
    return name.length > 0 ? name[0]!.toUpperCase() : '?';
  }
}
