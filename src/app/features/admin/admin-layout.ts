import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Admin area layout: a persistent secondary nav above the section content.
 * Mirrors SettingsLayout (tabs, not a sidebar) — one pattern, every breakpoint.
 * Only moderators should reach this layout; the server 403s any non-staff call.
 */
@Component({
  selector: 'fc-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {}
