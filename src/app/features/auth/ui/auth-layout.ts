import { Component, input } from '@angular/core';

/**
 * Centered guest-page card shared by login / register / verify-email.
 * Precursor to the future `fc-card` kit component — same tokens, same shape —
 * so adopting the kit later is a rename, not a restyle.
 *
 * NOTE: the heading input is called `heading`, not `title` — a static
 * `title="…"` on a component tag is ALSO rendered as a DOM attribute on the host
 * element, and browsers show ancestor titles as hover tooltips over every child.
 * (`lede` leaks the same way but is inert; `title` is the only behavioral one.)
 */
@Component({
  selector: 'fc-auth-layout',
  template: `
    <main id="main-content" class="auth-page">
      <section class="auth-card" aria-labelledby="auth-title">
        <p class="eyebrow">FriendCore</p>
        <h1 id="auth-title">{{ heading() }}</h1>
        @if (lede()) {
          <p class="lede">{{ lede() }}</p>
        }
        <ng-content />
        @if (hasFooter()) {
          <p class="switch">
            <ng-content select="[slot='switch']" />
          </p>
        }
      </section>
    </main>
  `,
  styleUrl: './auth-layout.scss',
})
export class AuthLayout {
  heading = input.required<string>();
  lede = input<string>('');
  /** Set when a `[slot='switch']` footer (e.g. "No account? Create one") is projected. */
  hasFooter = input(false);
}
