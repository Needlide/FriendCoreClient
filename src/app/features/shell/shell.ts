import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PreferencesService } from '../../core/preferences/preferences.service';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationBell } from '../notifications/notification-bell';

/**
 * Authenticated layout (ui-design-plan §5, components.md §AppShell): top bar with
 * nav, notification bell, and avatar menu; main <router-outlet> below.
 *
 * It also owns the two session-scoped lifecycles:
 *  - realtime: connect() on init (safe to repeat — the service no-ops when up),
 *    disconnect() on logout;
 *  - logout: stop realtime FIRST (so no push lands mid-teardown), then server
 *    logout, then login screen.
 */
@Component({
  selector: 'fc-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NotificationBell],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly realtime = inject(RealtimeService);
  private readonly prefs = inject(PreferencesService);
  private readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  protected readonly unread = signal(0);
  private subscription?: Subscription;

  ngOnInit(): void {
    this.refreshUnread();
    // Accessibility prefs apply document-wide (data-* on <html>); load failure
    // keeps the safe defaults — the settings page surfaces the error instead.
    this.prefs.load().subscribe({ error: () => undefined });
    // Push is only a bump — every event (and every reconnect) reconciles via REST.
    this.subscription = this.realtime.notification$.subscribe(() => this.refreshUnread());
    this.subscription.add(
      this.realtime.resync$.subscribe((hub) => {
        if (hub === 'notifications') this.refreshUnread();
      }),
    );
    void this.realtime.connect();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  protected myUsername(): string | undefined {
    return this.auth.session()?.username;
  }

  protected logout(): void {
    // Order matters: stop pushes first, then end the server session.
    void this.realtime.disconnect().then(() => {
      this.auth.logout().subscribe({
        next: () => void this.router.navigate(['/auth/login']),
        error: () => void this.router.navigate(['/auth/login']),
      });
    });
  }

  private refreshUnread(): void {
    this.notifications.unreadCount().subscribe({
      next: (res) => this.unread.set(res.count),
      error: () => undefined, // bell keeps its last count; the page shows errors
    });
  }
}
