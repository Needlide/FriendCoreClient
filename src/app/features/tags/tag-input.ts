import { Component, inject, input, output, signal } from '@angular/core';
import { Observable, map } from 'rxjs';
import { TagsService } from './tags.service';
import { TagSuggestion } from '../../core/models/tags.models';
import { SearchComponent, SearchSuggestion } from '../search/search';

/**
 * Tag autocomplete (docs/design/components.md §TagInput).
 *
 * All the reusable machinery — the debounce, the switchMap cancellation, the listbox
 * and its keyboard/ARIA handling — lives in {@link SearchComponent}. This component is
 * only what is genuinely tag-shaped:
 *  - mapping TagSuggestion rows onto the generic row type (id, label, "N people"),
 *  - the "you're the first" extra row, shown when nothing matches exactly,
 *  - splitting comma-separated free text into individual tags, and
 *  - the server's minimum tag length.
 *
 * The parent owns the tag list and the tier limits; this only emits names.
 */
@Component({
  selector: 'fc-tag-input',
  imports: [SearchComponent],
  template: `
    <fc-search
      [label]="label()"
      [placeholder]="placeholder()"
      [disabled]="disabled()"
      [minLength]="minLength"
      [search]="search"
      [extraRow]="extraRow"
      (selected)="onSelected($event)"
      (submitted)="onSubmitted($event)"
    />
    <p class="hint">Press Enter or pick a suggestion to add it — typing alone doesn't.</p>
  `,
  styles: `
    .hint {
      margin: var(--fc-space-1) 0 0;
      color: var(--fc-text-muted);
      font-size: var(--fc-text-sm);
    }
  `,
})
export class TagInput {
  private readonly tags = inject(TagsService);

  /** Visible label for the input (persistent — never placeholder-only, WCAG 3.3.2). */
  label = input.required<string>();
  /** Placeholder hint, e.g. "photography, synths…". */
  placeholder = input<string>('');
  /** When true the input disables (used when the tier limit is reached). */
  disabled = input(false);
  /** Fires with the chosen tag name (suggestion, free text, or first-use). */
  readonly tagAdd = output<string>();

  /** The server's minimum tag length; also the shortest query we bother sending. */
  protected readonly minLength = 2;

  /**
   * Whether the last response held an exact match. The "you're the first" row is
   * offered exactly when it doesn't — that is the whole meaning of the flag.
   */
  private readonly exactMatch = signal(true);

  /**
   * Transport handed to fc-search, which owns the debounce and the switchMap
   * cancellation (see its doc comment for why it is switchMap and not mergeMap).
   */
  protected readonly search = (query: string): Observable<SearchSuggestion[] | null> =>
    this.tags.autocomplete(query).pipe(
      map((res) => {
        this.exactMatch.set(res.hasExactMatch);
        return res.suggestions.map((s: TagSuggestion): SearchSuggestion => ({
          id: s.id,
          label: s.name,
          meta:
            s.totalCount > 0
              ? `${s.totalCount} ${s.totalCount === 1 ? 'person' : 'people'}`
              : undefined,
          value: s.name,
        }));
      }),
    );

  protected readonly extraRow = (query: string): SearchSuggestion | null =>
    this.exactMatch()
      ? null
      : { id: 'first-use', label: `Use “${query}” — you're the first`, value: query };

  protected onSelected(row: SearchSuggestion): void {
    this.tagAdd.emit(String(row.value));
  }

  protected onSubmitted(text: string): void {
    // Comma-separated pastes ("a, b, c") split into individual tags: the server drops
    // commas during normalization, so submitting them whole would mangle distinct tags
    // into one slug. Parts under the minimum are dropped (server rule).
    const parts = text
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length >= this.minLength);
    if (parts.length === 0) return;
    // No reset() call here: fc-search clears its own box immediately after emitting,
    // and calling back into it from inside its own output handler would run before
    // that cleanup.
    for (const part of parts) this.tagAdd.emit(part);
  }
}
