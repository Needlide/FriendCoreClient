import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { Subscription, filter } from 'rxjs';
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
  protected readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  private subscription?: Subscription;

  ngOnInit(): void {
    this.notifications.refreshUnread();
    this.notifications.loadSnooze();
    // Accessibility prefs apply document-wide (data-* on <html>); load failure
    // keeps the safe defaults — the settings page surfaces the error instead.
    this.prefs.load().subscribe({ error: () => undefined });
    // Push is only a bump — every event (and every reconnect) reconciles via REST.
    this.subscription = this.realtime.notification$.subscribe(() =>
      this.notifications.refreshUnread(),
    );
    this.subscription.add(
      this.realtime.resync$.subscribe((hub) => {
        if (hub === 'notifications') this.notifications.refreshUnread();
      }),
    );
    // A missed push (background tab, reconnect gap) leaves a stale badge behind a
    // navigation that otherwise changes nothing — one cheap GET per navigation ends
    // that whole class of staleness.
    this.subscription.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(() => this.notifications.refreshUnread()),
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
}
