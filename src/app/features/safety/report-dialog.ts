import { Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError } from '../../core/models/api-error';
import { REPORT_CATEGORIES, ReportCategory, ReportTarget } from '../../core/models/settings.models';
import { AuthError } from '../auth/ui/auth-error';
import { SettingsService } from '../settings/settings.service';

/**
 * Report dialog (components.md §ReportDialog). A native <dialog> does the hard
 * a11y work for free: showModal() traps focus, Escape closes, clicking the
 * ::backdrop can close too. The parent opens it via the `open()` method and
 * passes the target (post id or username) as an input.
 *
 * After a successful report the dialog closes itself with a "thanks" state shown
 * briefly first — routine success gets a beat of confirmation, not a toast chase.
 */
@Component({
  selector: 'fc-report-dialog',
  imports: [FormsModule, AuthError],
  templateUrl: './report-dialog.html',
  styleUrl: './report-dialog.scss',
})
export class ReportDialog {
  private readonly settings = inject(SettingsService);

  /** What is being reported — set before calling open(). */
  target = input.required<ReportTarget>();

  protected readonly categories = REPORT_CATEGORIES;
  protected readonly chosen = signal<ReportCategory | null>(null);
  protected readonly note = signal('');
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<ApiError | null>(null);

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  /** Reset state and show the modal. Parents call this (e.g. from a Report button). */
  open(): void {
    this.chosen.set(null);
    this.note.set('');
    this.sending.set(false);
    this.sent.set(false);
    this.error.set(null);
    this.dialog()?.nativeElement.showModal();
  }

  protected close(): void {
    this.dialog()?.nativeElement.close();
  }

  protected title(): string {
    const target = this.target();
    return target.kind === 'user' ? `Report @${target.username}` : 'Report this post';
  }

  /** Unique per dialog instance: one report dialog is mounted inside every post card. */
  protected noteId(): string {
    const target = this.target();
    return target.kind === 'user' ? `report-note-${target.username}` : `report-note-${target.id}`;
  }

  protected submit(): void {
    const category = this.chosen();
    if (!category || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    this.settings.report(this.target(), category, this.note()).subscribe({
      next: () => {
        this.sending.set(false);
        this.sent.set(true);
        // Stays open until dismissed. See the note in report-dialog.html: the previous
        // 1.2s timer closed before the confirmation could be read or announced.
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.sending.set(false);
      },
    });
  }
}
