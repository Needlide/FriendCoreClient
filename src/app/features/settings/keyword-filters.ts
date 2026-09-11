import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiError } from '../../core/models/api-error';
import { AuthError } from '../auth/ui/auth-error';
import { SettingsService } from './settings.service';

/**
 * Keyword filters (`/settings/filters`): posts containing these words never reach
 * the feed. Whole-set replace on every change (the PATCH body IS the full list),
 * so add/remove each save immediately — no separate Save button to forget.
 */
@Component({
  selector: 'fc-keyword-filters',
  imports: [FormsModule, AuthError],
  templateUrl: './keyword-filters.html',
  styleUrl: './keyword-filters.scss',
})
export class KeywordFilters {
  private readonly settings = inject(SettingsService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly keywords = signal<string[]>([]);
  protected readonly draft = signal('');
  protected readonly error = signal<ApiError | null>(null);

  constructor() {
    this.settings.getKeywordFilters().subscribe({
      next: (res) => {
        this.keywords.set(res.keywords);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.loading.set(false);
      },
    });
  }

  protected add(): void {
    const word = this.draft().trim().toLowerCase();
    if (!word || this.saving()) return;
    if (this.keywords().includes(word)) {
      this.draft.set('');
      return;
    }
    this.persist([...this.keywords(), word], () => this.draft.set(''));
  }

  protected remove(word: string): void {
    if (this.saving()) return;
    this.persist(this.keywords().filter((k) => k !== word));
  }

  /** Every mutation saves the whole list — the server has no add/remove endpoints. */
  private persist(next: string[], after?: () => void): void {
    this.saving.set(true);
    this.error.set(null);
    this.settings.updateKeywordFilters(next).subscribe({
      next: (res) => {
        // Adopt the server's echo (normalization lives there), not our guess.
        this.keywords.set(res.keywords);
        this.saving.set(false);
        after?.();
      },
      error: (err: unknown) => {
        this.error.set(err instanceof ApiError ? err : null);
        this.saving.set(false);
      },
    });
  }
}
