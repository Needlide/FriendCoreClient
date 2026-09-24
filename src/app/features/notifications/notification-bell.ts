import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Quiet notification bell (components.md §NotificationBell): a plain count badge,
 * never pulsing, per the no-dopamine rule. Count and silence state are owned by
 * NotificationsService; this just renders them and links to the list. Hidden badge
 * at zero — silence, not "0". While snoozed the bell shows muted, so silence reads
 * as a state, never as breakage.
 */
@Component({
  selector: 'fc-notification-bell',
  imports: [RouterLink],
  template: `
    <a class="bell" routerLink="/notifications" [attr.aria-label]="label()">
      <span aria-hidden="true">{{ silenced() ? '🔕' : '🔔' }}</span>
      @if (unread() > 0) {
        <span class="badge">{{ unread() > 99 ? '99+' : unread() }}</span>
      }
    </a>
  `,
  styles: [
    `
      .bell {
        position: relative;
        display: grid;
        place-items: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 50%;
        text-decoration: none;
        font-size: var(--fc-text-lg);
      }
      .badge {
        position: absolute;
        top: 0;
        right: 0;
        min-width: 1.25rem;
        height: 1.25rem;
        padding: 0 0.25rem;
        border-radius: 1rem;
        background: var(--fc-accent);
        color: var(--fc-accent-contrast);
        font-size: 0.75rem;
        font-weight: 700;
        display: grid;
        place-items: center;
      }
    `,
  ],
})
export class NotificationBell {
  unread = input<number>(0);
  /** Silence-all instant (ISO) or null. Same signal the snooze UI writes through. */
  silencedUntil = input<string | null>(null);

  protected silenced(): boolean {
    return this.silencedUntil() !== null;
  }

  protected label(): string {
    if (this.silenced()) return 'Notifications silenced';
    return this.unread() > 0 ? `Notifications, ${this.unread()} unread` : 'Notifications';
  }
}
