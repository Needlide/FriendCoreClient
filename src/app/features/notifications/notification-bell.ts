import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Quiet notification bell (components.md §NotificationBell): a plain count badge,
 * never pulsing, per the no-dopamine rule. The count is owned by the shell (it
 * reconciles via REST on every push/reconnect); this just renders it and links
 * to the list. Hidden badge at zero — silence, not "0".
 */
@Component({
  selector: 'fc-notification-bell',
  imports: [RouterLink],
  template: `
    <a
      class="bell"
      routerLink="/notifications"
      [attr.aria-label]="unread() > 0 ? 'Notifications, ' + unread() + ' unread' : 'Notifications'"
    >
      <span aria-hidden="true">🔔</span>
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
}
