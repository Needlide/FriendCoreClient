import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Root shell. Deliberately thin: a "skip to content" link (WCAG 2.4.1 — the first
 * focusable element on every page) plus the router outlet. The full AppShell
 * (top bar, nav, bell) arrives with UI-Plan step 1; auth screens render centered
 * inside their own layout until then.
 */
@Component({
  selector: 'fc-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}
