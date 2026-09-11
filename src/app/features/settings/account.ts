import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService } from '../../core/realtime/realtime.service';

/**
 * Account (`/settings/account`): who you're signed in as, verification state with
 * a resend path, and the second logout button in the app (the first lives in the
 * avatar menu). Logout order matches the shell: realtime off first, then the
 * server session, then the login screen.
 */
@Component({
  selector: 'fc-account',
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account {
  protected readonly auth = inject(AuthService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);

  protected readonly resending = signal(false);
  protected readonly resent = signal(false);
  protected readonly busy = signal(false);

  protected logout(): void {
    if (this.busy()) return;
    this.busy.set(true);
    void this.realtime.disconnect().then(() => {
      this.auth.logout().subscribe({
        next: () => void this.router.navigate(['/auth/login']),
        error: () => void this.router.navigate(['/auth/login']),
      });
    });
  }

  protected resend(): void {
    if (this.resending()) return;
    this.resending.set(true);
    this.auth.resendVerification().subscribe({
      next: () => {
        this.resending.set(false);
        this.resent.set(true);
      },
      error: () => this.resending.set(false),
    });
  }
}
