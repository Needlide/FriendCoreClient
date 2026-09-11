import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiError } from '../../core/models/api-error';
import { AuthError } from '../auth/ui/auth-error';
import { MessagingService } from '../messaging/messaging.service';

/**
 * Help & support (`/help`, UI-Plan §1). Sets expectations BEFORE the chat —
 * informal channel, async replies, no presence — and keeps formal reporting
 * separate (abuse reports belong in the report flow, not here).
 */
@Component({
  selector: 'fc-help',
  imports: [AuthError],
  template: `
    <div class="help-page">
      <h1>Help & support</h1>
      <section aria-labelledby="chat-h">
        <h2 id="chat-h">Message the team</h2>
        <p>
          Thanks, bug reports, and quick questions — reviewed by a person. Replies are async (days,
          not minutes); there's no online indicator here on purpose.
        </p>
        <p>
          Seen abuse or a violating post? Use <strong>Report</strong> on that content instead — it
          enters the moderation queue with context attached.
        </p>
        @if (error()) {
          <fc-auth-error [error]="error()" context="generic" />
        }
        <button type="button" class="fc-primary" (click)="open()" [disabled]="busy()">
          {{ busy() ? 'Opening…' : 'Open support chat' }}
        </button>
      </section>
    </div>
  `,
  styles: [
    `
      .help-page {
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
      section {
        background: var(--fc-surface);
        border: 1px solid var(--fc-border);
        border-radius: var(--fc-radius);
        padding: var(--fc-space-6) var(--fc-space-4);
        display: grid;
        gap: var(--fc-space-2);
      }
      section h2 {
        margin: 0;
      }
      section p {
        margin: 0;
        color: var(--fc-text-muted);
      }
      .fc-primary {
        font: inherit;
        font-weight: 600;
        min-height: 2.75rem;
        padding: 0 var(--fc-space-6);
        border: 0;
        border-radius: var(--fc-radius-sm);
        background: var(--fc-accent);
        color: var(--fc-accent-contrast);
        cursor: pointer;
        justify-self: start;
      }
      .fc-primary:disabled {
        opacity: 0.6;
        cursor: progress;
      }
    `,
  ],
})
export class Help {
  private readonly messaging = inject(MessagingService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  protected open(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.messaging.startSupport().subscribe({
      next: (conversation) => {
        this.busy.set(false);
        void this.router.navigate(['/messages', conversation.id]);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.busy.set(false);
      },
    });
  }
}
