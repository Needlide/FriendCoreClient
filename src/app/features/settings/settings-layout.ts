import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/**
 * Settings area layout: a persistent secondary nav above the section content.
 * Deliberately tabs, not a sidebar — inside the 42rem content column a sidebar would
 * squeeze content, and a global app sidebar would reopen the settled top-bar shell
 * decision. One pattern, every breakpoint, room for all six sections.
 */
@Component({
  selector: 'fc-settings-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './settings-layout.html',
  styleUrl: './settings-layout.scss',
})
export class SettingsLayout {}
