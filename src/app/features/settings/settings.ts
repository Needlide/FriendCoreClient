import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Settings index — plain link list; each section owns its screen. */
@Component({
  selector: 'fc-settings',
  imports: [RouterLink],
  template: `
    <div class="settings-page">
      <h1>Settings</h1>
      <nav aria-label="Settings sections">
        <a routerLink="/settings/profile">Profile</a>
        <a routerLink="/settings/preferences">Preferences & accessibility</a>
        <a routerLink="/settings/filters">Keyword filters</a>
        <a routerLink="/settings/appeals">Moderation & appeals</a>
        <a routerLink="/settings/account">Account</a>
      </nav>
    </div>
  `,
  styles: [
    `
      .settings-page {
        max-width: var(--fc-content-max);
        margin: 0 auto;
        padding: var(--fc-space-4);
        display: grid;
        gap: var(--fc-space-4);
      }
      h1 {
        margin: 0;
        font-size: var(--fc-text-xl);
      }
      nav {
        display: grid;
        background: var(--fc-surface);
        border: 1px solid var(--fc-border);
        border-radius: var(--fc-radius);
        overflow: hidden;
      }
      nav a {
        color: var(--fc-text);
        text-decoration: none;
        font-weight: 600;
        padding: var(--fc-space-4);
        border-bottom: 1px solid var(--fc-border);
      }
      nav a:last-child {
        border-bottom: 0;
      }
    `,
  ],
})
export class Settings {}
